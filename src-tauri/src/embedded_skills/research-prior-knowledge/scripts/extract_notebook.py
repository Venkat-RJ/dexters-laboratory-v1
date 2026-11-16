"""Extract code from a saved notebook or Kaggle response without executing it."""
import argparse
import hashlib
import json
from pathlib import Path
import sys


def extract(value):
    for _ in range(5):
        if isinstance(value, str):
            value = json.loads(value)
        elif isinstance(value, dict) and 'cells' in value:
            break
        elif isinstance(value, dict) and 'blob' in value:
            value = value['blob']
        elif isinstance(value, dict) and 'sourceNullable' in value:
            value = value['sourceNullable']
        else:
            raise ValueError('Expected notebook cells or a blob/sourceNullable notebook wrapper')
    if not isinstance(value, dict) or not isinstance(value.get('cells'), list):
        raise ValueError('Notebook cells must be a list')
    code = []
    for cell in value['cells']:
        if not isinstance(cell, dict) or not isinstance(cell.get('cell_type'), str):
            raise ValueError('Invalid notebook cell')
        if cell['cell_type'] != 'code':
            continue
        source = cell.get('source')
        if isinstance(source, list) and all(isinstance(part, str) for part in source):
            source = ''.join(source)
        if not isinstance(source, str):
            raise ValueError('Code cell source must be text or a list of strings')
        code.append(source.rstrip('\n') + '\n')
    if not code:
        raise ValueError('Notebook contains no code cells')
    return '\n'.join(code)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    try:
        raw = args.input.read_bytes()
        code = extract(json.loads(raw))
        # Never clobber an existing evaluator, including on schema errors.
        with args.output.open('x') as stream:
            stream.write(code)
        print(json.dumps({'ok': True, 'source': str(args.input), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                          'output': str(args.output), 'sha256': hashlib.sha256(code.encode()).hexdigest()}))
    except (OSError, ValueError, TypeError) as error:
        print(json.dumps({'ok': False, 'category': 'source_format_or_path', 'error': str(error),
                          'nextAction': 'Inspect the saved response and output path; do not execute or overwrite an unverified evaluator'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
