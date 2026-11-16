"""Run bounded real processes in a disposable, clearly labelled reliability project.

This is a deterministic integration benchmark, not a scientific Squares result.
"""
import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import time

SOURCE = Path(__file__).resolve().parents[1] / 'src-tauri/src/embedded_skills/research-experiment-execution/scripts/campaign.py'
spec = importlib.util.spec_from_file_location('campaign', SOURCE)
campaign = importlib.util.module_from_spec(spec)
spec.loader.exec_module(campaign)



def write_report(root, result):
    text = r"""\documentclass{article}
\usepackage[margin=1in]{geometry}
\usepackage[hidelinks]{hyperref}
\begin{document}
\section*{Local campaign reliability test}
This is a deterministic software integration fixture, not a Squares research result.
The worker evaluates $x^2$; an independent evaluator checks saved output.
The known optimum is zero. The baseline score is one.

COUNT real attempt processes finished with two worker slots: PASSED validated,
REJECTED rejected by the evaluator and FAILED deliberate execution failures.
The selected best is \texttt{E-0501} with score zero for this 1,000-attempt fixture.
Evidence identities and one validation receipt per completed attempt were checked.
The completed state and accepted best survived reopening.

\section*{Evidence and limits}
See \href{run:benchmark-result.json}{benchmark result}, the experiment tracker,
and \href{run:experiments/E-0501/experiment.md}{the best attempt note}.
This checks isolated local process execution and record handling. It does not
establish scientific novelty, GPU scaling or hard memory enforcement.
\end{document}
"""
    for token, value in [('COUNT', result['attempts']), ('PASSED', result['passed']), ('REJECTED', result['rejected']), ('FAILED', result['failed'])]:
        text = text.replace(token, str(value))
    best = result['best']['quadratic']['attemptId']
    text = text.replace('E-0501', best).replace('1,000-attempt', str(result['attempts'])+'-attempt')
    (root/'main.tex').write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--count', type=int, default=1000)
    args = parser.parse_args()
    if args.count < 3 or args.root.exists():
        parser.error('Use a new project directory and at least three attempts')
    root = args.root.resolve()
    assets = SOURCE.parents[2] / 'research-formulation/assets'
    shutil.copytree(assets, root)
    (root / 'compute.py').write_text('''import json,os,sys,time
from pathlib import Path
n=int(sys.argv[1]); x=float(sys.argv[2])
if n % 137 == 0: raise RuntimeError('Deliberate controlled execution failure')
time.sleep((n % 3) * .005)
value=x*x if n % 101 else -999
Path(os.environ['DEXTER_ARTIFACT_DIR'],'result.json').write_text(json.dumps({'x':x,'score':value,'attempt':n}))
''')
    (root / 'verify.py').write_text('''import json,sys,math
from pathlib import Path
value=json.loads(Path(sys.argv[1],'result.json').read_text())
expected=value['x']**2
accepted=math.isfinite(expected) and value['score']==expected
Path(sys.argv[2]).write_text(json.dumps({'accepted':accepted,'score':expected,'reason':'Saved x squared checked independently'}))
''')
    campaign.write(root / 'setup.json', {'status':'ready','checks':[{'exitCode':0,'evidence':'benchmark control harness'}]})
    campaign.write(root / 'mind-map.json', {'version':1,'topics':[{'id':'root','label':'Deterministic reliability fixture, not Squares research','depth':0}, {'id':'quadratic','label':'Known quadratic optimum','depth':1}]})
    c = campaign.Campaign(root)
    counter = 0
    def request(action, **fields):
        nonlocal counter
        counter += 1
        return c.request({'action':action,'operationId':'bench-'+str(counter),**fields})
    def enqueue(n):
        x = 1 if n == 1 else (n - (args.count // 2 + 1)) / args.count
        fields = dict(id=f'E-{n:04}',title=f'Reliability test {n}',nodeId='quadratic',evaluationId='quadratic',kind='baseline' if n == 1 else 'candidate',
                      command=[sys.executable,'compute.py',str(n),str(x)],sourceFiles=['compute.py'],artifacts=['result.json'],seconds=10,
                      setup={'record':'setup.json','files':['verify.py']},plan='Controlled integration fixture. Evaluator checks saved x squared. No scientific packing claim.')
        return request('enqueue', **fields)
    start = time.monotonic()
    request('create', workers=2, attemptLimit=args.count)
    request('evaluation',evaluation={'id':'quadratic','metric':'Squared error','unit':'test units','direction':'lower','baselineId':'E-0001','files':['verify.py'], 'command':[sys.executable,'verify.py','{artifacts}','{result}'],'seconds':10})
    request('resume')
    timed_out = False
    try:
        enqueue(1)
        while True:
            c.tick({})
            state=request('inspect')
            if state['attempts']['E-0001']['validation']=='passed': break
            if time.monotonic()-start>30: raise RuntimeError('Baseline failed')
            time.sleep(.03)
        queued = time.monotonic()
        for n in range(2,args.count+1): enqueue(n)
        enqueue_seconds=time.monotonic()-queued
        print(json.dumps({'phase':'queued','attempts':args.count,'seconds':enqueue_seconds,'eventBytes':(c.folder/'events.jsonl').stat().st_size}),flush=True)
        last=0
        peak_running=0
        while True:
            c.tick({})
            state=request('inspect')
            peak_running=max(peak_running,state['runningCount'])
            done=sum(a['status'] not in ('queued','running') and not a.get('verificationRequested') for a in state['attempts'].values())
            if done>=last+100 or done==args.count:
                print(json.dumps({'phase':'executing','closed':done,'seconds':round(time.monotonic()-start,2)}),flush=True);last=done
            if done==args.count and not c.verifying: break
            if time.monotonic()-start>900:
                timed_out=True;raise RuntimeError('Benchmark reached its explicit 15 minute test ceiling')
            time.sleep(.03)
        state=request('complete',reason='Controlled reliability benchmark finished; known optimum reached')
        attempts=state['attempts']
        known=f'E-{args.count//2+1:04}'
        assert state['best']['quadratic']['attemptId']==known, state['best']
        assert state['best']['quadratic']['score']==0
        assert len(attempts)==args.count and peak_running<=2
        failed=sum(a['status']=='failed' for a in attempts.values())
        rejected=sum(a['validation']=='rejected' for a in attempts.values())
        assert failed==sum(n%137==0 for n in range(1,args.count+1))
        assert rejected==sum(n%101==0 and n%137!=0 for n in range(1,args.count+1))
        for name,a in attempts.items():
            if a['status']=='completed':
                evidence=campaign.read(root/'experiments'/name/'result.json')
                assert evidence['attempt']==int(name[2:]),name
                assert len(list((root/'experiments'/name).glob('validation-*.json')))==1,name
        reopened=campaign.Campaign(root).request({'action':'inspect'})
        assert reopened['best']==state['best'] and reopened['status']=='completed'
        result={'attempts':args.count,'seconds':time.monotonic()-start,'enqueueSeconds':enqueue_seconds,'workers':2,'peakRunning':peak_running,
                'passed':sum(a['validation']=='passed' for a in attempts.values()),'rejected':rejected,'failed':failed,'best':state['best'],
                'eventBytes':(c.folder/'events.jsonl').stat().st_size,'recoveredCompletedState':True,'evidenceIsolationChecked':True}
        campaign.write(root/'research-state.json', {'version':1,'stage':'experiments','status':'complete','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'completedPasses':0,'detail':f'Controlled reliability test: {args.count} real attempts completed; known quadratic optimum 0. Not Squares research.'})
        campaign.write(root/'benchmark-result.json',result)
        write_report(root, result)
        print(json.dumps(result),flush=True)
    finally:
        if timed_out or c.state['status']!='completed': request('stop')
        for child in list(c.children.values()):
            try: child.wait(timeout=5)
            except Exception: pass

if __name__=='__main__': main()
