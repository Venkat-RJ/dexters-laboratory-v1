"""Regression tests for real isolated local campaign processes."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'src-tauri/src/embedded_skills/research-experiment-execution/scripts/campaign.py'
spec = importlib.util.spec_from_file_location('campaign', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CampaignTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        (self.root / 'compute.py').write_text('''import os,json,sys,time
from pathlib import Path
time.sleep(float(sys.argv[2]))
Path(os.environ['DEXTER_ARTIFACT_DIR'],'result.json').write_text(json.dumps({'score':float(sys.argv[1]),'accepted':sys.argv[3]=='yes'}))
''')
        (self.root / 'verify.py').write_text('''import json,sys
from pathlib import Path
value=json.loads(Path(sys.argv[1],'result.json').read_text())
Path(sys.argv[2]).write_text(json.dumps(value))
''')
        module.write(self.root / 'setup.json', {'status':'ready','checks':[{'exitCode':0,'evidence':'smoke.json'}]})
        self.campaign = module.Campaign(self.root)
        self.request('create', budgetSeconds=30, workers=2)
        self.request('evaluation', evaluation={'id':'test','metric':'Score','direction':'lower', 'baselineId':'B',
                      'files':['verify.py'],'command':[sys.executable,'verify.py','{artifacts}','{result}']})
        self.request('resume')

    def tearDown(self):
        self.request('stop')
        end = time.time() + 3
        while self.campaign.verifying and time.time() < end:
            time.sleep(.05)

    def request(self, action, **kwargs):
        return self.campaign.request({'action':action,'operationId':str(time.time_ns()),**kwargs})

    def enqueue(self, name, score, delay=0, valid=True, kind='candidate'):
        return self.request('enqueue', id=name, title=name, nodeId='branch', evaluationId='test', kind=kind,
                            command=[sys.executable,'compute.py',str(score),str(delay),'yes' if valid else 'no'],
                            sourceFiles=['compute.py'],artifacts=['result.json'],seconds=5,
                            setup={'record':'setup.json','files':['verify.py']})

    def finish(self, names):
        end=time.time()+10
        while time.time()<end:
            self.campaign.tick({})
            state=self.request('inspect')
            if all(state['attempts'][n]['validation'] != 'pending' for n in names):
                return state
            time.sleep(.05)
        self.fail('Attempts did not complete')

    def baseline(self):
        self.enqueue('B',10,kind='baseline')
        return self.finish(['B'])

    def test_optional_window_and_resume_preserve_deadline(self):
        self.request('stop')
        state = self.request('create')
        self.assertIsNone(state['budgetSeconds'])
        self.assertIsNone(state['remainingSeconds'])
        self.assertEqual(state['reserveSeconds'], 0)
        self.assertEqual(state['budgetSource'], 'agent-decided')
        deadline = state['deadline']
        self.request('resume')
        self.request('pause')
        self.assertEqual(self.request('resume')['deadline'], deadline)
        self.request('stop')
        state = self.request('create', budgetSeconds=12)
        self.assertEqual(state['budgetSeconds'], 12)
        self.assertEqual(state['budgetSource'], 'explicit')
        self.request('stop')
        with self.assertRaises(ValueError):
            self.request('create', budgetSeconds=0)

    def test_no_limit_campaign_runs_verifies_and_completes_after_old_cutoff(self):
        self.request('stop')
        self.request('create')
        self.request('evaluation', evaluation={'id':'test','metric':'Score','direction':'lower', 'baselineId':'B',
                      'files':['verify.py'],'command':[sys.executable,'verify.py','{artifacts}','{result}']})
        self.request('resume')
        with patch.object(module.time, 'time', return_value=time.time() + 3600):
            self.campaign.tick({})
            self.assertEqual(self.request('inspect')['status'], 'running')
            self.enqueue('B', 10, kind='baseline')
        self.finish(['B'])
        self.enqueue('better', 9)
        state = self.finish(['better'])
        self.assertEqual(state['best']['test']['attemptId'], 'better')
        self.assertIsNone(state['remainingSeconds'])
        self.request('pause')
        self.campaign = module.Campaign(self.root)
        self.assertIsNone(self.request('resume')['deadline'])
        state = self.request('complete', reason='Goal met: validated score 9')
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(state['reason'], 'Goal met: validated score 9')

    def test_explicit_deadline_still_stops_campaign(self):
        deadline = self.request('inspect')['deadline']
        with patch.object(module.time, 'time', return_value=deadline + 1):
            self.campaign.tick({})
            state = self.request('inspect')
            self.assertEqual(state['status'], 'stopped')
            self.assertEqual(state['reason'], 'Campaign deadline reached')
            with self.assertRaisesRegex(ValueError, 'expired'):
                self.request('resume')

    def test_no_limit_keeps_attempt_timeout_and_stop(self):
        self.request('stop')
        self.request('create')
        self.request('evaluation', evaluation={'id':'test','metric':'Score','direction':'lower', 'baselineId':'B',
                      'files':['verify.py'],'command':[sys.executable,'verify.py','{artifacts}','{result}']})
        self.request('resume')
        self.enqueue('slow', 10, delay=10, kind='baseline')
        with self.campaign.locked():
            self.campaign.state['attempts']['slow']['seconds'] = .2
            self.campaign.save('short-run-limit')
        end = time.time() + 5
        while time.time() < end:
            self.campaign.tick({})
            if self.request('inspect')['attempts']['slow']['status'] == 'timed_out':
                break
            time.sleep(.05)
        self.assertEqual(self.request('inspect')['attempts']['slow']['status'], 'timed_out')
        self.assertEqual(self.request('stop')['status'], 'stopped')

    def test_setup_validates_without_score_or_baseline_and_never_promotes(self):
        (self.root / 'verify.py').write_text("import json,sys; from pathlib import Path; Path(sys.argv[2]).write_text(json.dumps({'accepted':True,'reason':'controls passed'}))")
        self.request('evaluation', evaluation={'id':'smoke','metric':'Controls','direction':'lower',
                      'files':['verify.py'],'command':[sys.executable,'verify.py','{artifacts}','{result}']})
        self.request('enqueue', id='S', title='Setup', nodeId='branch', evaluationId='smoke', kind='setup',
                     command=[sys.executable,'compute.py','0','0','yes'], sourceFiles=['compute.py'], artifacts=['result.json'], seconds=5)
        state = self.finish(['S'])
        self.assertEqual(state['attempts']['S']['validation'], 'passed')
        self.assertEqual(state['best'], {})
        self.assertNotIn('score', state['attempts']['S'])
        receipt = module.read(self.root / 'experiments/S/validation.json')
        self.assertIsNone(receipt['metric'])
        self.assertNotIn('score', receipt)
        self.assertEqual(state['branchPlateaus'], {})
        self.request('verify', id='S')
        self.finish(['S'])

    def test_virtualenv_path_survives_isolated_setup_and_baseline(self):
        venv = self.root / '.venv'
        subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(venv)], check=True, capture_output=True)
        python = str(venv / 'bin/python')
        (self.root / 'compute.py').write_text("import os,json,sys; from pathlib import Path; assert sys.prefix != sys.base_prefix; Path(os.environ['DEXTER_ARTIFACT_DIR'],'result.json').write_text(json.dumps({'accepted':True,'score':10}))")
        self.request('enqueue', id='S', title='Setup', nodeId='branch', evaluationId='test', kind='setup',
                     command=[python,'compute.py'], sourceFiles=['compute.py'], artifacts=['result.json'], seconds=5)
        self.finish(['S'])
        module.write(self.root / 'setup.json', {'status':'ready','runtime':{'executable':python},
                     'checks':[{'attemptId':'S','exitCode':0}]})
        with self.assertRaisesRegex(ValueError, 'Runtime differs'):
            self.enqueue('wrong', 10, kind='baseline')
        self.request('enqueue', id='B', title='Baseline', nodeId='branch', evaluationId='test', kind='baseline',
                     command=[python,'compute.py'], sourceFiles=['compute.py'], artifacts=['result.json'], seconds=5,
                     setup={'record':'setup.json','files':['verify.py']})
        state = self.finish(['B'])
        self.assertEqual(state['best']['test']['score'], 10)

    def test_setup_runtime_mismatch_is_blocked_before_enqueue(self):
        env = {'status':'ready','runtime':{'executable':str(self.root / '.venv/bin/python')},
               'checks':[{'exitCode':0,'evidence':'smoke.json'}]}
        module.write(self.root / 'setup.json', env)
        with self.assertRaisesRegex(ValueError, 'Runtime differs'):
            self.enqueue('B', 10, kind='baseline')
        self.assertNotIn('B', self.request('inspect')['attempts'])
        env['runtime']['executable'] = sys.executable
        env['checks'][0]['attemptId'] = 'missing-smoke'
        module.write(self.root / 'setup.json', env)
        with self.assertRaisesRegex(ValueError, 'independent validation'):
            self.enqueue('B', 10, kind='baseline')

    def test_smoke_ready_without_baseline_then_candidates(self):
        module.write(self.root / 'setup.json', {'status':'ready', 'baseline':None,
                                              'checks':[{'exitCode':0,'evidence':'smoke.json'}]})
        with self.assertRaisesRegex(ValueError, 'baseline'):
            self.enqueue('too-early', 9)
        self.baseline()
        self.enqueue('after-baseline', 9)
        self.assertEqual(self.finish(['after-baseline'])['best']['test']['score'], 9)

    def test_parallel_rejection_and_best(self):
        self.baseline()
        self.enqueue('slow',8,.4)
        self.enqueue('fast',7,.05)
        state=self.finish(['slow','fast'])
        self.assertEqual(state['best']['test']['attemptId'],'fast')
        self.enqueue('invalid',1,valid=False)
        state=self.finish(['invalid'])
        self.assertEqual(state['attempts']['invalid']['validation'],'rejected')
        self.assertEqual(state['best']['test']['score'],7)

    def test_resume_preserves_running_work(self):
        self.baseline()
        self.enqueue('live', 9, 1)
        self.campaign.tick({})
        before = self.request('inspect')['attempts']['live']['process']
        self.request('resume')
        self.assertEqual(self.request('inspect')['attempts']['live']['process'], before)
        self.finish(['live'])

    def test_recovers_newer_event_after_manifest_interruption(self):
        old = self.campaign.path.read_bytes()
        self.request('pause')
        self.campaign.path.write_bytes(old)
        self.campaign = module.Campaign(self.root)
        recovered = self.request('inspect')
        self.assertEqual(recovered['status'], 'paused')

    def test_delta_history_recovers_all_attempts_without_full_state_per_event(self):
        self.baseline()
        old = self.campaign.path.read_bytes()
        for i in range(100):
            self.enqueue('queued-' + str(i), 9)
        expected = json.loads(self.campaign.path.read_text())
        journal = self.campaign.folder / 'events.jsonl'
        records = [json.loads(line) for line in journal.read_text().splitlines()]
        self.assertTrue(any('patch' in item for item in records))
        self.assertLess(journal.stat().st_size, 600_000)
        self.campaign.path.write_bytes(old)
        self.campaign = module.Campaign(self.root)
        actual = self.request('inspect')
        self.assertEqual(actual['attempts'], expected['attempts'])
        self.assertEqual(actual['revision'], expected['revision'])
        self.assertEqual(json.loads(self.campaign.path.read_text())['operations'], expected['operations'])

    def test_torn_tail_preserved_and_new_events_recover_after_restart(self):
        journal = self.campaign.folder / 'events.jsonl'
        with journal.open('ab') as f:
            f.write(b'{"revision":')
        self.campaign = module.Campaign(self.root)
        self.request('pause')
        self.assertTrue(list(self.campaign.folder.glob('incomplete-event-*.bin')))
        self.campaign.path.unlink()
        self.campaign = module.Campaign(self.root)
        self.assertEqual(self.request('inspect')['status'], 'paused')

    def test_legacy_history_and_new_campaign_with_lower_revision_recover(self):
        old = json.loads(self.campaign.path.read_text())
        journal = self.campaign.folder / 'events.jsonl'
        journal.write_text(json.dumps({'revision':old['revision'],'state':old}) + '\n')
        self.campaign = module.Campaign(self.root)
        self.request('stop')
        new = self.request('create', workers=2)
        self.campaign.path.write_text(json.dumps(old))
        self.campaign = module.Campaign(self.root)
        self.assertEqual(self.request('inspect')['id'], new['id'])

    def test_compact_summary_keeps_best_baseline_and_exact_attempt_lookup(self):
        self.baseline()
        for i in range(50):
            self.enqueue('queued-' + str(i), 9)
        state = self.request('inspect', compact=True)
        self.assertEqual(state['attemptCount'], 51)
        self.assertLessEqual(len(state['attempts']), 21)
        self.assertEqual(state['queuedCount'], 50)
        self.assertIn('B', state['attempts'])
        self.assertNotIn('queued-25', state['attempts'])
        detail = self.request('inspect', id='queued-25', compact=True)
        self.assertEqual(list(detail['attempts']), ['queued-25'])
        self.assertEqual(detail['attempts']['queued-25']['status'], 'queued')

    def test_complete_event_without_newline_remains_appendable(self):
        journal = self.campaign.folder / 'events.jsonl'
        journal.write_bytes(journal.read_bytes().rstrip(b'\n'))
        self.campaign = module.Campaign(self.root)
        self.request('pause')
        self.campaign.path.unlink()
        self.campaign = module.Campaign(self.root)
        self.assertEqual(self.request('inspect')['status'], 'paused')

    def test_final_receipt_imports_fast_case_events(self):
        folder = self.root / 'experiments' / 'fast-case'
        folder.mkdir(parents=True)
        (folder/'cases.jsonl').write_text('{"type":"result","case":"check","result":"passed"}\n')
        self.campaign.execution_receipt({'id':'fast-case','seconds':5}, 'completed', 0)
        self.assertEqual(module.read(folder/'run-status.json')['completedCases'],1)

    def test_owner_death_terminates_worker(self):
        folder = self.root / 'owner-death'
        folder.mkdir()
        owner = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        payload = {'folder':str(folder), 'cwd':str(self.root), 'command':[sys.executable,'-c','import time; time.sleep(30)'],
                   'deadline':time.time()+10, 'seconds':10, 'startedAt':time.time(),
                   'owner':{'pid':owner.pid, 'started':module.identity(owner.pid)}}
        module.write(folder/'worker.json', payload)
        worker = subprocess.Popen([sys.executable,str(SOURCE),'--worker',str(folder/'worker.json')], start_new_session=True)
        try:
            time.sleep(.2)
            owner.kill()
            owner.wait()
            worker.wait(timeout=4)
            result=module.read(folder/'worker-result.json')
            self.assertEqual(result['status'],'interrupted')
        finally:
            if owner.poll() is None: owner.kill(); owner.wait()
            if worker.poll() is None: os.killpg(worker.pid,9); worker.wait()

    def test_verifier_watchdog_stops_after_supervisor_death(self):
        owner = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        target = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
        payload = self.root / 'guardian.json'
        module.write(payload, {'owner': {'pid': owner.pid, 'started': module.identity(owner.pid)},
                               'target': {'pid': target.pid, 'started': module.identity(target.pid)}})
        guardian = subprocess.Popen([sys.executable, str(SOURCE), '--watchdog', str(payload)])
        try:
            time.sleep(.2)
            owner.kill()
            owner.wait()
            target.wait(timeout=4)
            guardian.wait(timeout=4)
            self.assertEqual(target.returncode, -9)
        finally:
            for process in (owner, target, guardian):
                if process.poll() is None:
                    process.kill()
                    process.wait()

    def test_reserve_cancels_queue_and_requests_reporting(self):
        self.baseline()
        self.enqueue('queued', 9)
        with self.campaign.locked():
            self.campaign.state['deadline'] = time.time() + 3
            self.campaign.save('budget-test')
        self.campaign.tick({})
        state = self.request('inspect')
        self.assertEqual(state['attempts']['queued']['status'], 'interrupted')
        self.assertIn('reporting reserve', state['reason'])

    def test_completed_campaign_survives_app_stop(self):
        self.baseline()
        self.request('complete', reason='Finished report')
        self.request('stop')
        self.assertEqual(self.request('inspect')['status'], 'completed')

    def test_process_identity_does_not_match_other_start(self):
        self.assertFalse(module.alive({'pid':os.getpid(),'started':'different start'}))

    def test_verification_cancellation_keeps_baseline(self):
        self.baseline()
        self.enqueue('candidate',5)
        end=time.time()+5
        while time.time()<end:
            self.campaign.tick({})
            if 'candidate' in self.campaign.verifying:
                self.request('stop')
                break
            time.sleep(.01)
        self.assertEqual(self.request('inspect')['best']['test']['score'],10)

    def test_five_nonimprovements_request_branch_reassessment(self):
        self.baseline()
        for index in range(5):
            name = 'neutral' + str(index)
            self.enqueue(name,10)
            state = self.finish([name])
        self.assertEqual(state['branchPlateaus']['branch'],5)
        self.request('reassess',nodeId='branch',reason='Try another method')
        self.assertEqual(self.request('inspect')['branchPlateaus']['branch'],0)

    def test_normalizes_failure_identity(self):
        a='File "/one/run.py", line 1042\nValueError: bad input at 0x123ab'
        b='File "/two/run.py", line 8765\nValueError: bad input at 0x888ab'
        self.assertEqual(module.normalize_failure(a),module.normalize_failure(b))

    def test_stop_reaps_worker(self):
        self.baseline()
        self.enqueue('orphan', 5, 4)
        with self.campaign.locked():
            attempt = self.campaign.state['attempts']['orphan']
            self.campaign.launch(attempt)
            self.campaign.save('launch')
            process = self.campaign.children['orphan']
        self.request('stop')
        process.wait(timeout=3)
        self.assertIsNotNone(process.returncode)

    def test_timeout_and_snapshot_isolation(self):
        self.baseline()
        self.enqueue('timeout', 5, 3)
        with self.campaign.locked():
            self.campaign.state['attempts']['timeout']['seconds'] = .2
            self.campaign.save('test-timeout')
        end = time.time() + 5
        while time.time() < end:
            self.campaign.tick({})
            if self.request('inspect')['attempts']['timeout']['status'] == 'timed_out':
                break
            time.sleep(.05)
        self.assertEqual(self.request('inspect')['attempts']['timeout']['status'], 'timed_out')
        self.assertEqual(self.request('inspect')['best']['test']['score'], 10)
        original = (self.root / 'compute.py').read_bytes()
        workspace = Path(self.request('inspect')['attempts']['timeout']['workspace'])
        (workspace / 'compute.py').write_text('changed')
        self.assertEqual((self.root / 'compute.py').read_bytes(), original)

    def test_legacy_metric_is_not_validation(self):
        self.baseline()
        self.enqueue('missing', 1)
        with self.campaign.locked():
            self.campaign.state['attempts']['missing']['artifacts'] = ['does-not-exist.json']
            self.campaign.save('test-invalid-artifact')
        state = self.finish(['missing'])
        self.assertEqual(state['attempts']['missing']['validation'], 'error')
        self.assertEqual(state['best']['test']['score'], 10)

    def test_changed_inputs_and_baseline_gate(self):
        with self.assertRaisesRegex(ValueError,'baseline'):
            self.enqueue('early',2)
        self.baseline()
        (self.root/'verify.py').write_text('changed')
        with self.assertRaisesRegex(ValueError,'Identity changed'):
            self.enqueue('changed',2)

    def test_verification_retry_and_idempotency(self):
        self.baseline()
        before=(self.root/'experiments/B/run-status.json').read_bytes()
        request={'action':'verify','id':'B','operationId':'same'}
        self.campaign.request(request)
        self.campaign.tick({})
        end = time.time() + 3
        while self.campaign.verifying and time.time() < end:
            time.sleep(.05)
        self.campaign.request(request)
        self.campaign.tick({})
        self.assertEqual(len(list((self.root/'experiments/B').glob('validation-*.json'))),2)
        self.assertEqual(before,(self.root/'experiments/B/run-status.json').read_bytes())

    def test_stop_preserves_deadline(self):
        self.baseline()
        self.enqueue('long',5,4)
        self.campaign.tick({})
        before=self.request('inspect')['deadline']
        self.request('stop')
        self.request('resume')
        state=self.request('inspect')
        self.assertEqual(state['deadline'],before)
        self.assertEqual(state['attempts']['long']['status'],'interrupted')

if __name__=='__main__':
    unittest.main()
