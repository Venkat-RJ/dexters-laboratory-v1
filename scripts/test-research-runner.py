"""Exercise real runner processes without changing a research project."""

import json
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest


RUNNER = Path(__file__).resolve().parents[1] / "src-tauri/src/embedded_skills/research-experiment-execution/scripts/run_experiment.py"


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.folder = self.root / "experiments/E-001"
        self.folder.mkdir(parents=True)
        (self.root / "experiments.json").write_text(json.dumps({
            "version": 1, "experiments": [{"id": "E-001"}],
        }))

    def command(self, code, limit=5):
        return [sys.executable, str(RUNNER), "E-001", str(limit), "--", sys.executable, "-c", code]

    def run_code(self, code, limit=5):
        return subprocess.run(self.command(code, limit), cwd=self.root, capture_output=True, timeout=10)

    def receipt(self):
        return json.loads((self.folder / "run-status.json").read_text())

    def test_completed_run_preserves_all_cases_and_bounds_visible_results(self):
        code = '''
import json, os
with open(os.environ["DEXTER_CASE_EVENTS"], "a") as stream:
    stream.write("malformed event\\n")
    for index in range(40):
        stream.write(json.dumps({"type": "result", "case": str(index), "result": "checked"}) + "\\n")
    stream.write(json.dumps({"type": "summary", "metric": {"name": "side", "value": 5, "baseline": 4}}) + "\\n")
print("all cases retained")
'''
        self.assertEqual(self.run_code(code).returncode, 0)
        receipt = self.receipt()
        self.assertEqual(receipt["status"], "completed")
        self.assertEqual(receipt["completedCases"], 40)
        self.assertEqual(len(receipt["results"]), 25)
        self.assertEqual(receipt["metric"]["value"], 5)
        self.assertEqual(len((self.folder / "cases.jsonl").read_text().splitlines()), 42)
        before = (self.folder / "run-status.json").read_bytes()
        self.assertNotEqual(self.run_code("raise SystemExit(0)").returncode, 0)
        self.assertEqual((self.folder / "run-status.json").read_bytes(), before)

    def test_nonzero_exit_is_failed_and_retains_error(self):
        self.assertEqual(self.run_code("import sys; print('checker failed', file=sys.stderr); sys.exit(7)").returncode, 1)
        self.assertEqual(self.receipt()["status"], "failed")
        self.assertEqual(self.receipt()["exitCode"], 7)
        self.assertIn("checker failed", (self.folder / "stderr.txt").read_text())

    def test_missing_executable_is_recorded(self):
        result = subprocess.run([sys.executable, str(RUNNER), "E-001", "5", "--", str(self.root / "missing")],
                                cwd=self.root, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.receipt()["status"], "failed")
        self.assertTrue((self.folder / "stderr.txt").read_text())

    def test_deadline_stops_worker(self):
        result = self.run_code("import time; time.sleep(30)", limit=0.5)
        self.assertEqual(result.returncode, 124)
        self.assertEqual(self.receipt()["status"], "timed_out")
        self.assertLess(self.receipt()["elapsedSeconds"], 5)

    def test_interrupt_records_partial_progress(self):
        code = '''
import os, time
with open(os.environ["DEXTER_CASE_EVENTS"], "a") as stream:
    stream.write('{"type":"result","case":"control","result":"checked"}\\n')
time.sleep(30)
'''
        process = subprocess.Popen(self.command(code), cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if (self.folder / "run-status.json").exists() and self.receipt()["completedCases"] == 1:
                    break
                time.sleep(0.02)
            else:
                self.fail("Runner did not publish live progress")
            process.send_signal(signal.SIGTERM)
            process.communicate(timeout=5)
            self.assertEqual(process.returncode, 130)
            self.assertEqual(self.receipt()["status"], "interrupted")
            self.assertEqual(self.receipt()["completedCases"], 1)
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate()


if __name__ == "__main__":
    unittest.main()
