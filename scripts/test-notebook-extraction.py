import importlib.util
import json
from pathlib import Path
import unittest
import subprocess
import sys
import tempfile

p = Path(__file__).resolve().parents[1] / 'src-tauri/src/embedded_skills/research-prior-knowledge/scripts/extract_notebook.py'
spec = importlib.util.spec_from_file_location('extract_notebook', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ExtractionTests(unittest.TestCase):
    def test_supported_wrappers(self):
        notebook = {'cells': [{'cell_type': 'markdown', 'source': '# Context'},
                              {'cell_type': 'code', 'source': ['a = 1\n', 'b = 2']},
                              {'cell_type': 'code', 'source': 'print(a + b)'}]}
        for value in [notebook, json.dumps(notebook), {'blob': notebook},
                      {'blob': {'sourceNullable': json.dumps(notebook)}}]:
            self.assertEqual(m.extract(value), 'a = 1\nb = 2\n\nprint(a + b)\n')

    def test_bad_responses_fail_with_actionable_reason(self):
        for value in [{'error': 'denied'}, {'blob': None}, {'cells': {}},
                      {'cells': [{'cell_type': 'code', 'source': 42}]}]:
            with self.assertRaises(ValueError):
                m.extract(value)


class ProbeTests(unittest.TestCase):
    script = p.parents[2] / 'research-formulation/assets/setup/probe.py'

    def test_missing_optional_tool_is_information(self):
        result = subprocess.run([sys.executable, str(self.script), 'capabilities', 'no-such-optional-tool-4829'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['tools']['no-such-optional-tool-4829']['status'], 'missing')

    def test_empty_search_is_distinct_from_missing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.txt'
            source.write_text('known text')
            result = subprocess.run([sys.executable, str(self.script), 'search', 'absent', str(source)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)['status'], 'no_matches')
            result = subprocess.run([sys.executable, str(self.script), 'search', 'absent', str(source) + '.missing'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['status'], 'search_error')


if __name__ == '__main__':
    unittest.main()
