"""Persistent local campaign coordinator. JSON requests on stdin, JSON responses on stdout."""
import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import threading
import re
import resource
import uuid
from contextlib import contextmanager


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else hashlib.sha256(stream.read()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def relative(root, name):
    if not isinstance(name, str) or Path(name).is_absolute():
        raise ValueError('Use a project-relative path')
    path = (root / name).resolve()
    if path == root or root not in path.parents:
        raise ValueError('Path must be inside the project')
    return path


def identifier(value):
    import re
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        raise ValueError('Invalid identifier')
    return value


def positive(value, label):
    if type(value) not in (float, int) or not math.isfinite(value) or value <= 0:
        raise ValueError(label + ' must be positive and finite')
    return value


def command(value):
    if not isinstance(value, list) or not value or any(not isinstance(x, str) or not x for x in value):
        raise ValueError('Command must be a nonempty argv array')
    return value


def identity(pid):
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'lstart='], capture_output=True, text=True)
    return result.stdout.strip() or None


def alive(process):
    return bool(process and identity(process['pid']) == process['started'])


class Campaign:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.folder = self.root / '.research/campaign'
        self.folder.mkdir(parents=True, exist_ok=True)
        self.path = self.folder / 'state.json'
        self.children = {}
        self.verifying = set()
        self.verifiers = {}
        self.recovered = False
        self.thread_lock = threading.RLock()

    @contextmanager
    def locked(self):
        with self.thread_lock, (self.folder / 'lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.state = read(self.path)
            journal = self.folder / 'events.jsonl'
            if journal.exists() and not self.recovered:
                recovered = None
                with journal.open('rb+') as events:
                    while True:
                        start = events.tell()
                        line = events.readline()
                        if not line:
                            break
                        try:
                            item = json.loads(line)
                        except ValueError:
                            if events.read(1):
                                raise ValueError('Campaign event history is damaged before its final record')
                            # Preserve an interrupted final append, then make the journal appendable.
                            (self.folder / ('incomplete-event-' + uuid.uuid4().hex + '.bin')).write_bytes(line)
                            events.truncate(start)
                            events.flush()
                            os.fsync(events.fileno())
                            break
                        if not line.endswith(b'\n'):
                            events.write(b'\n')
                            events.flush()
                            os.fsync(events.fileno())
                        if 'state' in item:
                            recovered = item['state']  # Legacy snapshots and new campaign starts.
                        elif 'patch' in item:
                            if not recovered or item.get('campaignId') != recovered['id'] or item['revision'] != recovered['revision'] + 1:
                                raise ValueError('Campaign event history has a missing revision')
                            recovered.update(item['patch'])
                            for key, delta in item.get('maps', {}).items():
                                target = recovered.setdefault(key, {})
                                for removed in delta['remove']:
                                    target.pop(removed, None)
                                target.update(delta['set'])
                if recovered and (not self.state or recovered['id'] != self.state['id'] or recovered['revision'] > self.state['revision']):
                    self.state = recovered
                    write(self.path, self.state)
            self.recovered = True
            self.persisted = copy.deepcopy(self.state)
            yield

    def save(self, event, detail=None):
        self.state['revision'] += 1
        self.state['updatedAt'] = time.time()
        record = {'revision': self.state['revision'], 'campaignId': self.state['id'],
                  'at': time.time(), 'event': event, 'detail': detail}
        previous = getattr(self, 'persisted', None)
        if previous is None or previous['id'] != self.state['id']:
            record['state'] = self.state
        else:
            # Append only changed entries. Repeating every attempt on every event grows quadratically.
            record['patch'] = {}
            record['maps'] = {}
            for key, value in self.state.items():
                old = previous.get(key)
                if value == old:
                    continue
                if isinstance(value, dict) and isinstance(old, dict):
                    record['maps'][key] = {'set': {k: v for k, v in value.items() if k not in old or old[k] != v},
                                           'remove': [k for k in old if k not in value]}
                else:
                    record['patch'][key] = value
        with (self.folder / 'events.jsonl').open('a') as stream:
            stream.write(json.dumps(record, separators=(',', ':'), allow_nan=False) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        write(self.path, self.state)
        self.persisted = copy.deepcopy(self.state)
        manifest = {key: value for key, value in self.state.items() if key != 'operations'}
        write(self.root / '.research/campaign-manifest.json', manifest)
        with self.path.open('rb') as saved:
            os.fsync(saved.fileno())

    def summary(self, compact=False, attempt_id=None):
        if not self.state:
            return None
        result = dict(self.state)
        result['operations'] = []
        result['verificationCount'] = sum(a.get('verificationRequested', False) for a in self.state['attempts'].values())
        result['remainingSeconds'] = (max(0, self.state['deadline'] - self.state.get('finishedAt', time.time()))
                                      if self.state.get('deadline') is not None else None)
        result['runningCount'] = sum(x['status'] == 'running' for x in self.state['attempts'].values())
        result['waitingForAgent'] = self.state['status'] == 'running' and not result['runningCount'] and not self.state.get('agentThreadId')
        result['queuedCount'] = sum(x['status'] == 'queued' for x in self.state['attempts'].values())
        if attempt_id is not None:
            result['attempts'] = {attempt_id: self.state['attempts'][attempt_id]}
        elif compact:
            attempts = self.state['attempts']
            closed = [a for a in attempts.values() if a['status'] not in ('queued', 'running')]
            closed.sort(key=lambda a: a.get('updatedAt', a.get('startedAt', 0)))
            keep = {a['id'] for a in closed[-20:]}
            keep.update([a['id'] for a in attempts.values() if a['status'] == 'queued'][:5])
            keep.update(best['attemptId'] for best in self.state['best'].values())
            keep.update(e.get('baselineId') for e in self.state['evaluations'].values())
            active = [a['id'] for a in attempts.values() if a['status'] == 'running' or a.get('verificationRequested')]
            keep.update(active[:20])
            result['attempts'] = {key: value for key, value in attempts.items() if key in keep}
        if compact or attempt_id is not None:
            result['attemptCount'] = len(self.state['attempts'])
            result['omittedAttemptCount'] = len(self.state['attempts']) - len(result['attempts'])
        return result

    def deadline(self, search=False):
        deadline = self.state.get('deadline')
        if deadline is None:
            return math.inf
        return deadline - (self.state['reserveSeconds'] if search else 0)

    def fingerprints(self, root, files):
        if not isinstance(files, list) or not files:
            raise ValueError('Declare files whose identities must be preserved')
        return {name: digest(relative(root, name)) for name in files}

    def evaluation(self, data):
        identifier(data['id'])
        if data['direction'] not in ('lower', 'higher') or not data.get('metric'):
            raise ValueError('Evaluation requires metric and direction')
        command(data['command'])
        positive(data.get('seconds', 60), 'Verification limit')
        tolerance = data.get('tolerance', 0)
        if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or tolerance < 0:
            raise ValueError('Invalid comparison tolerance')
        if data.get('repeats', 1) != 1:
            raise ValueError('Save repeated measurements in the attempt and aggregate them inside the declared evaluator')
        result = dict(data)
        result['fingerprints'] = self.fingerprints(self.root, data['files'])
        result['tolerance'] = tolerance
        result['seconds'] = data.get('seconds', 60)
        return result

    def request(self, request):
        action = request['action']
        with self.locked():
            if action == 'inspect':
                return self.summary(request.get('compact', False), request.get('id') if action == 'inspect' else None)
            operation = request.get('operationId')
            if not operation:
                raise ValueError('Mutation requires operationId')
            if self.state and operation in self.state['operations']:
                return self.summary(request.get('compact', False), request.get('id') if action == 'inspect' else None)
            if action == 'create':
                if self.state and self.state['status'] not in ('stopped', 'completed'):
                    raise ValueError('Stop the existing campaign first')
                if self.state:
                    write(self.folder / ('archive-' + self.state['id'] + '.json'), self.state)
                budget = positive(request['budgetSeconds'], 'Campaign window') if 'budgetSeconds' in request else None
                if request.get('attemptLimit') is not None:
                    positive(request['attemptLimit'], 'Attempt limit')
                workers = request.get('workers', 2)
                if type(workers) is not int or workers < 1:
                    raise ValueError('Workers must be a positive integer')
                if request.get('hardMemoryBytes') or request.get('hardCpuSeconds'):
                    raise ValueError('This backend does not enforce hard memory or CPU limits')
                self.state = {'version': 1, 'id': uuid.uuid4().hex, 'revision': 0, 'status': 'paused',
                              'startedAt': time.time(), 'deadline': time.time() + budget if budget is not None else None,
                              'budgetSeconds': budget, 'budgetSource': 'explicit' if 'budgetSeconds' in request else 'agent-decided',
                              'reserveSeconds': min(300, budget * .2) if budget is not None else 0, 'workers': min(workers, os.cpu_count() or 1),
                              'attemptLimit': request.get('attemptLimit'), 'attempts': {}, 'evaluations': {},
                              'best': {}, 'operations': [], 'reason': 'Ready', 'branchPlateaus': {}, 'failures': {}, 'resources': {'cpuSeconds': 0, 'peakRssBytes': 0}}
            elif not self.state:
                raise ValueError('Create a campaign first')
            elif action == 'attach-agent':
                self.state['agentThreadId'] = request['threadId']
            elif action == 'evaluation':
                evaluation = self.evaluation(request['evaluation'])
                previous = self.state['evaluations'].get(evaluation['id'])
                if previous and previous != evaluation:
                    raise ValueError('Changed evaluation requires a new ID')
                self.state['evaluations'][evaluation['id']] = evaluation
            elif action == 'enqueue':
                self.enqueue(request)
            elif action == 'verify':
                attempt = self.state['attempts'][request['id']]
                if attempt['status'] in ('queued', 'running'):
                    raise ValueError('Wait for execution before verification')
                attempt['verificationRequested'] = True
            elif action == 'resume':
                if self.state['status'] == 'running':
                    return self.summary(request.get('compact', False), request.get('id') if action == 'inspect' else None)
                if self.deadline() <= time.time():
                    raise ValueError('Campaign deadline has expired')
                self.state['status'] = 'running'
                self.state['reason'] = 'Running'
            elif action == 'pause':
                self.state['status'] = 'paused'
                self.state['reason'] = 'Paused by user'
            elif action == 'stop':
                self.stop('Stopped by user')
            elif action == 'reconcile':
                self.reconcile()
            elif action == 'extend':
                if self.state.get('deadline') is None:
                    raise ValueError('Campaign has no time limit to extend')
                self.state['deadline'] += positive(request['seconds'], 'Budget extension')
            elif action == 'reassess':
                if not request.get('reason'):
                    raise ValueError('Record the next research decision')
                self.state['branchPlateaus'][request['nodeId']] = 0
            elif action == 'complete':
                if self.verifying or any(a.get('verificationRequested') for a in self.state['attempts'].values()):
                    raise ValueError('Wait for verification before completing the campaign')
                if any(x['status'] in ('queued', 'running') for x in self.state['attempts'].values()):
                    raise ValueError('Finish or cancel active attempts first')
                self.state['status'] = 'completed'
                self.state['finishedAt'] = time.time()
                self.state['reason'] = request['reason']
            else:
                raise ValueError('Unknown campaign action')
            self.state['operations'].append(operation)
            self.save(action, request.get('id'))
            return self.summary(request.get('compact', False), request.get('id') if action == 'inspect' else None)

    def enqueue(self, request):
        attempt_id = identifier(request['id'])
        if attempt_id in self.state['attempts']:
            raise ValueError('Attempt exists; use a new ID for a measurement retry')
        if self.state['status'] in ('stopped', 'completed'):
            raise ValueError('Resume or create a campaign before enqueueing')
        if self.state['attemptLimit'] and len(self.state['attempts']) >= self.state['attemptLimit']:
            raise ValueError('Attempt limit reached')
        if time.time() >= self.deadline(search=True):
            raise ValueError('Search time exhausted; final verification reserve has started')
        command(request['command'])
        if type(request.get('cpuSlots', 1)) is not int or request.get('cpuSlots', 1) < 1:
            raise ValueError('cpuSlots must be a positive integer')
        if request.get('cpuSlots', 1) > self.state['workers']:
            raise ValueError('Attempt CPU slots exceed campaign worker allocation')
        for part in request['command'][1:]:
            if part.startswith(str(self.root) + os.sep):
                raise ValueError('Use relative source paths so execution stays in the isolated workspace')
        positive(request['seconds'], 'Attempt limit')
        evaluation = self.state['evaluations'][request['evaluationId']]
        self.check_files(self.root, evaluation['fingerprints'])
        kind = request.get('kind', 'candidate')
        if kind not in ('setup', 'baseline', 'candidate'):
            raise ValueError('Unknown attempt kind')
        if request.get('parentAttemptId') and request['parentAttemptId'] not in self.state['attempts']:
            raise ValueError('Parent attempt does not exist')
        if kind == 'candidate':
            baseline = self.state['attempts'].get(evaluation.get('baselineId'))
            if not baseline or baseline.get('validation') != 'passed':
                raise ValueError('Validate the declared baseline first')
        if self.state['failures'].get(request.get('nodeId', ''), {}).get('count', 0) >= 2 and kind != 'setup':
            raise ValueError('Repeated infrastructure failure requires a successful setup check')
        if kind != 'setup':
            setup = request.get('setup')
            if not setup:
                raise ValueError('Declare setup evidence and identity files')
            evidence = read(relative(self.root, setup['record']))
            if not evidence or evidence.get('status') != 'ready' or not evidence.get('checks') or any(check.get('exitCode') != 0 for check in evidence['checks']):
                raise ValueError('Successful setup evidence is required')
            self.check_runtime(evidence, request['command'])
            setup = {**setup, 'fingerprints': self.fingerprints(self.root, [setup['record']] + setup['files'])}
        else:
            setup = None
        files = request.get('sourceFiles', [])
        if not files:
            raise ValueError('Declare sourceFiles for the isolated attempt')
        source = self.fingerprints(self.root, files)
        if any(name.startswith(('.research/', 'experiments/')) for name in evaluation['fingerprints']):
            raise ValueError('Keep evaluator source and fixed inputs outside generated evidence folders')
        for name, value in evaluation['fingerprints'].items():
            source[name] = value
        attempt = {**request, 'kind': kind, 'status': 'queued', 'validation': 'pending',
                   'setup': setup, 'source': source, 'verificationRequested': False, 'process': None}
        journal_path = self.root / 'experiments.json'
        journal = read(journal_path, {'version': 1, 'experiments': []})
        entry = next((x for x in journal['experiments'] if x['id'] == attempt_id), None)
        if not entry:
            if not request.get('nodeId') or not request.get('title'):
                raise ValueError('New attempt requires title and nodeId')
            entry = {'id': attempt_id, 'nodeId': request['nodeId'], 'title': request['title'],
                     'evaluation': {'id': evaluation['id'], 'direction': evaluation['direction'], 'tolerance': evaluation['tolerance']}}
            journal['experiments'].append(entry)
        entry['queued'] = True
        entry.setdefault('hypothesis', request.get('hypothesis', 'Test the recorded candidate'))
        entry.setdefault('baseline', request.get('baseline', evaluation.get('baselineId', 'Reference check')))
        entry.setdefault('success', request.get('success', 'Pass the declared evaluation'))
        entry.setdefault('plan', 'experiments/' + attempt_id + '/experiment.md')
        for link in ('parentAttemptId', 'retryOf'):
            if request.get(link):
                entry[link] = request[link]
        write(journal_path, journal)
        folder = self.root / 'experiments' / attempt_id
        folder.mkdir(parents=True, exist_ok=True)
        note = folder / 'experiment.md'
        if not note.exists():
            note.write_text('# ' + entry['title'] + '\n\n' + request.get('plan', '') + '\n')
        self.state['attempts'][attempt_id] = attempt

    def check_files(self, root, fingerprints):
        for name, expected in fingerprints.items():
            if digest(relative(root, name)) != expected:
                raise ValueError('Identity changed: ' + name)

    def stop(self, reason):
        if self.state['status'] == 'completed':
            return
        for process in list(self.verifiers.values()):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        for attempt in self.state['attempts'].values():
            if attempt['status'] == 'queued':
                attempt['status'] = 'interrupted'
                self.execution_receipt(attempt, 'interrupted', None)
            if attempt['status'] == 'running':
                self.terminate(attempt)
                attempt['status'] = 'interrupted'
                self.execution_receipt(attempt, 'interrupted', None)
        for child in self.children.values():
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        self.children.clear()
        self.state['status'] = 'stopped'
        self.state['reason'] = reason

    def terminate(self, attempt):
        process = attempt.get('process')
        if alive(process):
            try:
                os.killpg(process['pid'], signal.SIGKILL)
            except ProcessLookupError:
                pass

    def reconcile(self):
        for attempt in self.state['attempts'].values():
            if attempt['status'] == 'running':
                completion = read(self.root / 'experiments' / attempt['id'] / 'worker-result.json')
                if completion:
                    attempt['status'] = completion['status']
                    self.execution_receipt(attempt, completion['status'], completion['exitCode'])
                    attempt['verificationRequested'] = completion['status'] == 'completed'
                else:
                    self.terminate(attempt)
                    attempt['status'] = 'interrupted'
                    self.execution_receipt(attempt, 'interrupted', None)
        if self.state['status'] == 'running':
            self.state['status'] = 'paused'
            self.state['reason'] = 'Reconciled after interruption; resume when ready'

    def check_runtime(self, evidence, argv):
        executable = (evidence.get('runtime') or {}).get('executable')
        if executable and os.path.abspath(argv[0]) != os.path.abspath(executable):
            raise ValueError('Runtime differs from setup: use the recorded interpreter path exactly, without resolving virtualenv symlinks, or rerun setup')
        for check in evidence.get('checks', []):
            attempt_id = check.get('attemptId')
            if attempt_id:
                smoke = self.state['attempts'].get(attempt_id)
                if not smoke or smoke['kind'] != 'setup' or smoke.get('validation') != 'passed':
                    raise ValueError('Setup attempt must pass independent validation before launch')
                if executable and os.path.abspath(smoke['command'][0]) != os.path.abspath(executable):
                    raise ValueError('Recorded runtime differs from the successful setup worker')

    def launch(self, attempt):
        evaluation = self.state['evaluations'][attempt['evaluationId']]
        self.check_files(self.root, evaluation['fingerprints'])
        self.check_files(self.root, attempt['source'])
        if attempt['setup']:
            self.check_files(self.root, attempt['setup']['fingerprints'])
            self.check_runtime(read(relative(self.root, attempt['setup']['record'])), attempt['command'])
        workspace = self.folder / 'workspaces' / attempt['id']
        if workspace.exists():
            raise ValueError('Attempt workspace already exists')
        commit = attempt.get('gitCommit')
        if not commit and (self.root / '.git').exists():
            raise ValueError('Git projects require a committed candidate revision')
        if commit:
            subprocess.run(['git', 'worktree', 'add', '--detach', str(workspace), commit], cwd=self.root,
                           check=True, capture_output=True, timeout=30)
            self.check_files(workspace, attempt['source'])
        else:
            workspace.mkdir(parents=True)
            for name in attempt['source']:
                dest = relative(workspace, name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(relative(self.root, name), dest)
        folder = self.root / 'experiments' / attempt['id']
        write(folder / 'source-manifest.json', attempt['source'])
        write(folder / 'evaluation.json', evaluation)
        if attempt['setup']:
            shutil.copy2(relative(self.root, attempt['setup']['record']), folder / 'environment.json')
        attempt['workspace'] = str(workspace)
        attempt['startedAt'] = time.time()
        attempt['deadline'] = min(time.time() + attempt['seconds'], self.deadline(search=True))
        payload = {'command': attempt['command'], 'cwd': str(workspace), 'folder': str(folder),
                   'deadline': attempt['deadline'], 'seconds': attempt['seconds'], 'startedAt': attempt['startedAt'], 'gitCommit': commit, 'cpuSlots': attempt.get('cpuSlots', 1), 'owner': {'pid': os.getpid(), 'started': identity(os.getpid())}}
        write(folder / 'worker.json', payload)
        log = (folder / 'supervisor.log').open('ab')
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', str(folder / 'worker.json')],
                                   start_new_session=True, stdout=log, stderr=log)
        log.close()
        for _ in range(100):
            started = identity(process.pid)
            if started:
                break
            time.sleep(.01)
        self.children[attempt['id']] = process
        attempt['process'] = {'pid': process.pid, 'started': started}
        attempt['status'] = 'running'
        self.execution_receipt(attempt, 'running', None)

    def execution_receipt(self, attempt, status, code):
        attempt['updatedAt'] = time.time()
        folder = self.root / 'experiments' / attempt['id']
        receipt = read(folder / 'run-status.json', {})
        results = read_events(folder / 'cases.jsonl')
        receipt['completedCases'] = len(results)
        receipt['results'] = results[-25:]
        receipt.update({'status': status, 'updatedAt': time.time(), 'completedCases': receipt.get('completedCases', 0),
                        'elapsedSeconds': max(0, time.time() - attempt.get('startedAt', time.time())),
                        'limitSeconds': attempt['seconds'], 'exitCode': code, 'gitCommit': attempt.get('gitCommit'),
                        'process': attempt.get('process'), 'metric': receipt.get('metric')})
        write(folder / 'run-status.json', receipt)

    def verify(self, attempt):
        # Snapshot immutable inputs before running the external verifier without the state lock.
        evaluation = self.state['evaluations'][attempt['evaluationId']]
        campaign_id = self.state['id']
        folder = self.root / 'experiments' / attempt['id']
        number = len(list(folder.glob('validation-*.json'))) + 1
        result_path = folder / ('verification-output-' + str(number) + '.json')
        remaining = min(evaluation['seconds'], self.deadline() - time.time())
        receipt = {'version': 1, 'attemptId': attempt['id'], 'evaluationId': evaluation['id'],
                   'status': 'error', 'updatedAt': time.time(), 'metric': None}
        try:
            self.check_files(self.root, evaluation['fingerprints'])
            if attempt.get('workspace'):
                self.check_files(Path(attempt['workspace']), attempt['source'])
            artifacts = self.fingerprints(folder, attempt['artifacts'])
            argv = [part.replace('{artifacts}', str(folder)).replace('{result}', str(result_path))
                    for part in evaluation['command']]
            # Execute a fresh evaluator snapshot, isolated from candidate modifications.
            verifier = folder / ('verifier-' + str(number))
            verifier.mkdir()
            for name in evaluation['fingerprints']:
                target = relative(verifier.resolve(), name)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(relative(self.root, name), target)
            remaining = min(evaluation['seconds'], self.deadline() - time.time())
            positive(remaining, 'Remaining verification time')
            with (folder / ('verification-' + str(number) + '.log')).open('wb') as output:
                process = subprocess.Popen(argv, cwd=verifier, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
                self.verifiers[attempt['id']] = process
                guardian_file = folder / ('verification-guardian-' + str(number) + '.json')
                write(guardian_file, {'owner': {'pid': os.getpid(), 'started': identity(os.getpid())},
                                      'target': {'pid': process.pid, 'started': identity(process.pid)}})
                guardian = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--watchdog', str(guardian_file)],
                                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                            stderr=subprocess.DEVNULL, start_new_session=True)
                try:
                    verification_deadline = time.time() + remaining
                    while process.poll() is None:
                        latest = read(self.path, {})
                        if latest.get('status') == 'stopped' or time.time() >= verification_deadline:
                            raise ValueError('Verification interrupted or timed out')
                        time.sleep(.1)
                    code = process.returncode
                finally:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait()
                    self.verifiers.pop(attempt['id'], None)
                    guardian.terminate()
                    guardian.wait()
            self.check_files(self.root, evaluation['fingerprints'])
            self.check_files(verifier.resolve(), evaluation['fingerprints'])
            self.check_files(folder, artifacts)
            value = read(result_path)
            if code != 0 or not isinstance(value, dict) or type(value.get('accepted')) is not bool:
                raise ValueError('Verifier must exit zero and write accepted plus a finite score')
            score = value.get('score')
            if attempt['kind'] != 'setup' and (type(score) not in (float, int) or not math.isfinite(score)):
                raise ValueError('Verifier score must be finite')
            receipt.update({'status': 'passed' if value['accepted'] else 'rejected', 'artifacts': artifacts,
                            'evaluator': evaluation['fingerprints'], 'reason': value.get('reason', '')})

            if attempt['kind'] != 'setup':
                receipt['score'] = score

        except (ValueError, OSError, subprocess.SubprocessError, KeyError) as error:
            receipt['reason'] = str(error)
        with self.locked():
            if self.state['id'] != campaign_id:
                return
            current = self.state['attempts'][attempt['id']]
            if self.state['status'] == 'stopped':
                receipt['status'] = 'error'
                receipt['reason'] = 'Campaign stopped before validation was accepted'
            if receipt['status'] == 'passed' and current['kind'] == 'setup':
                self.state['failures'].pop(current.get('nodeId', ''), None)
                self.state['decisionRevision'] = self.state.get('decisionRevision', 0) + 1
            if receipt['status'] == 'passed' and current['kind'] != 'setup':
                try:
                    self.promote(current, evaluation, receipt['score'], receipt)
                except (KeyError, ValueError) as error:
                    receipt['status'] = 'error'
                    receipt['reason'] = str(error)
            if receipt['status'] != 'passed':
                best = self.state['best'].get(evaluation['id'])
                if best and best['attemptId'] == attempt['id']:
                    self.state['best'].pop(evaluation['id'], None)
                    alternatives = [a for a in self.state['attempts'].values()
                                    if a['id'] != attempt['id'] and a.get('validation') == 'passed'
                                    and a['evaluationId'] == evaluation['id'] and 'score' in a]
                    if alternatives:
                        replacement = sorted(alternatives, key=lambda a: a['score'], reverse=evaluation['direction'] == 'higher')[0]
                        previous = read(self.root / 'experiments' / replacement['id'] / 'validation.json')
                        self.state['best'][evaluation['id']] = {'attemptId': replacement['id'], 'score': replacement['score'], 'artifacts': previous['artifacts']}
            current['updatedAt'] = time.time()
            current['validation'] = receipt['status']
            current['verificationRequested'] = False
            self.verifying.discard(attempt['id'])
            write(folder / ('validation-' + str(number) + '.json'), receipt)
            write(folder / 'validation.json', receipt)
            self.save('verified', attempt['id'])

    def promote(self, attempt, evaluation, score, receipt):
        baseline_id = evaluation.get('baselineId')
        if attempt['kind'] == 'baseline':
            if baseline_id != attempt['id']:
                raise ValueError('Baseline ID does not match evaluation')
            baseline = score
        else:
            baseline = self.state['attempts'][baseline_id]['score']
        attempt['score'] = score
        direction = 1 if evaluation['direction'] == 'higher' else -1
        delta = direction * (score - baseline)
        tolerance = evaluation['tolerance']
        receipt['metric'] = {'name': evaluation['metric'], 'value': score, 'baseline': baseline, 'unit': evaluation.get('unit')}
        receipt['outcome'] = 'neutral' if abs(delta) <= tolerance else 'improved' if delta > 0 else 'worse'
        best = self.state['best'].get(evaluation['id'])
        retained = best is None or direction * (score - best['score']) > tolerance
        receipt['retained'] = retained
        if retained:
            self.state['best'][evaluation['id']] = {'attemptId': attempt['id'], 'score': score, 'artifacts': receipt['artifacts']}
        branch = attempt.get('nodeId', '')
        if attempt.get('validation') != 'passed':
            self.state['branchPlateaus'][branch] = 0 if retained else self.state['branchPlateaus'].get(branch, 0) + 1
        receipt['reassessmentNeeded'] = self.state['branchPlateaus'][branch] >= 5
        self.state['decisionRevision'] = self.state.get('decisionRevision', 0) + 1

    def tick(self, children):
        verification_jobs = []
        with self.locked():
            if not self.state:
                return
            changed = False
            if self.state['status'] in ('running', 'paused') and time.time() >= self.deadline():
                self.stop('Campaign deadline reached')
                changed = True
            for attempt in self.state['attempts'].values():
                process = self.children.get(attempt['id'])
                if process and process.poll() is not None:
                    self.children.pop(attempt['id'], None)
                if attempt['status'] == 'running':
                    completion = read(self.root / 'experiments' / attempt['id'] / 'worker-result.json')
                    if completion:
                        attempt['status'] = completion['status']
                        usage = completion.get('resources', {})
                        totals = self.state.setdefault('resources', {'cpuSeconds': 0, 'peakRssBytes': 0})
                        totals['cpuSeconds'] += usage.get('cpuSeconds', 0)
                        totals['peakRssBytes'] = max(totals['peakRssBytes'], usage.get('peakRssBytes', 0))
                        self.execution_receipt(attempt, completion['status'], completion['exitCode'])
                        final_path = self.root / 'experiments' / attempt['id'] / 'run-status.json'
                        final_receipt = read(final_path)
                        final_receipt['resources'] = usage
                        write(final_path, final_receipt)
                        attempt['verificationRequested'] = completion['status'] == 'completed'
                        branch = attempt.get('nodeId', '')
                        if completion['status'] == 'failed':
                            cause = (self.root / 'experiments' / attempt['id'] / 'stderr.txt').read_text(errors='replace')[-2000:]
                            cause = normalize_failure(cause)
                            signature = hashlib.sha256(cause.encode()).hexdigest()
                            prior = self.state['failures'].get(branch, {})
                            self.state['failures'][branch] = {'signature': signature, 'count': prior.get('count', 0) + 1 if prior.get('signature') == signature else 1}
                        changed = True
                    elif not alive(attempt.get('process')):
                        attempt['status'] = 'interrupted'
                        self.execution_receipt(attempt, 'interrupted', None)
                        changed = True
                if self.state['status'] == 'running' and attempt.get('verificationRequested') and attempt['id'] not in self.verifying and len(self.verifying) < self.state['workers']:
                    self.verifying.add(attempt['id'])
                    verification_jobs.append(dict(attempt))
            running = sum(x.get('cpuSlots', 1) for x in self.state['attempts'].values() if x['status'] == 'running')
            if self.state['status'] == 'running':
                for attempt in self.state['attempts'].values():
                    if running >= self.state['workers']:
                        break
                    if attempt['status'] != 'queued':
                        continue
                    if running + attempt.get('cpuSlots', 1) > self.state['workers']:
                        continue
                    if time.time() >= self.deadline(search=True):
                        self.state['reason'] = 'Final verification and reporting reserve'
                        for queued in self.state['attempts'].values():
                            if queued['status'] == 'queued':
                                queued['status'] = 'interrupted'
                                self.execution_receipt(queued, 'interrupted', None)
                        self.state['decisionRevision'] = self.state.get('decisionRevision', 0) + 1
                        changed = True
                        break
                    try:
                        self.launch(attempt)
                        running += attempt.get('cpuSlots', 1)
                    except (ValueError, OSError, subprocess.SubprocessError) as error:
                        attempt['status'] = 'failed'
                        attempt['error'] = str(error)
                        self.execution_receipt(attempt, 'failed', None)
                    changed = True
            if changed:
                self.save('tick')
        for attempt in verification_jobs:
            threading.Thread(target=self.verify, args=(attempt,), daemon=True).start()


def normalize_failure(text):
    text = re.sub(r'File "[^"]+", line \d+', 'File <source>', text)
    text = re.sub(r'0x[0-9a-fA-F]+|\b\d{4,}\b', '<value>', text)
    return text.strip()


def read_events(path):
    if not path.exists():
        return []
    results = []
    for line in path.read_text(errors='replace').splitlines():
        try:
            event = json.loads(line)
            if event.get('type') == 'result' and isinstance(event.get('case'), str) and isinstance(event.get('result'), str):
                results.append(event)
        except (ValueError, AttributeError):
            pass
    return results


def worker(path):
    data = read(Path(path))
    folder = Path(data['folder'])
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    process = None
    descendants = set()
    status = 'failed'
    code = None
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        with (folder / 'stdout.txt').open('xb') as output, (folder / 'stderr.txt').open('xb') as errors:
            process = subprocess.Popen(data['command'], cwd=data['cwd'], stdout=output, stderr=errors,
                                       env={**os.environ, 'OMP_NUM_THREADS': str(data.get('cpuSlots', 1)), 'OPENBLAS_NUM_THREADS': str(data.get('cpuSlots', 1)), 'MKL_NUM_THREADS': str(data.get('cpuSlots', 1)), 'DEXTER_ARTIFACT_DIR': str(folder), 'DEXTER_CASE_EVENTS': str(folder / 'cases.jsonl')})
            while process.poll() is None:
                events = read_events(folder / 'cases.jsonl')
                write(folder / 'run-status.json', {'status': 'running', 'updatedAt': time.time(),
                      'elapsedSeconds': max(0, time.time() - data['startedAt']),
                      'limitSeconds': data['seconds'], 'completedCases': len(events), 'results': events[-25:],
                      'activeCase': None, 'metric': None, 'gitCommit': data.get('gitCommit')})
                group = subprocess.run(['ps', '-axo', 'pid=,pgid='], capture_output=True, text=True)
                for line in group.stdout.splitlines():
                    pid, pgid = map(int, line.split())
                    if pgid == os.getpgrp() and pid != os.getpid():
                        descendants.add(pid)
                if not alive(data['owner']):
                    status = 'interrupted'
                    break
                if time.time() >= data['deadline']:
                    status = 'timed_out'
                    break
                time.sleep(.1)
            else:
                code = process.returncode
                status = 'completed' if code == 0 else 'failed'
    except (OSError, KeyboardInterrupt):
        status = 'interrupted' if process else 'failed'
    finally:
        # Child shares this worker's session. Ignore SIGTERM locally during cleanup.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            os.killpg(os.getpgrp(), signal.SIGTERM)
        except ProcessLookupError:
            pass
        if process:
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for pid in descendants:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        usage = resource.getrusage(resource.RUSAGE_CHILDREN)
        peak = usage.ru_maxrss if sys.platform == 'darwin' else usage.ru_maxrss * 1024
        write(folder / 'worker-result.json', {'status': status, 'exitCode': code,
              'resources': {'cpuSeconds': max(0, usage.ru_utime + usage.ru_stime - before.ru_utime - before.ru_stime),
                            'peakRssBytes': peak, 'accounting': 'observed child usage, peak is not concurrent aggregate'}})


def watchdog(path):
    data = read(Path(path))
    while alive(data['target']):
        if not alive(data['owner']):
            # Target identity is checked again before signalling its process group.
            if alive(data['target']):
                try:
                    os.killpg(data['target']['pid'], signal.SIGKILL)
                except ProcessLookupError:
                    pass
            return
        time.sleep(.1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.')
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--owner', type=int)
    parser.add_argument('--worker')
    parser.add_argument('--watchdog')
    args = parser.parse_args()
    if args.watchdog:
        watchdog(args.watchdog)
        return
    if args.worker:
        worker(args.worker)
        return
    campaign = Campaign(args.root)
    if args.serve:
        owner = {'pid': args.owner, 'started': identity(args.owner)} if args.owner else None
        stopping = False
        def stop(signum, frame):
            nonlocal stopping
            stopping = True
        signal.signal(signal.SIGTERM, stop)
        with (campaign.folder / 'service.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            with campaign.locked():
                if campaign.state:
                    campaign.reconcile()
                    campaign.save('service-start')
            write(campaign.folder / 'service.json', {'pid': os.getpid(), 'started': identity(os.getpid())})
            while not stopping and (not owner or alive(owner)):
                campaign.tick({})
                time.sleep(.25)
            with campaign.locked():
                if campaign.state:
                    campaign.stop('Application closed')
                    campaign.save('service-stop')
        return
    try:
        print(json.dumps({'ok': True, 'campaign': campaign.request(json.load(sys.stdin))}, allow_nan=False))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
