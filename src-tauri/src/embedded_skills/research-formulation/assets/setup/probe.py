"""Read-only capability and search checks with explicit empty-result handling."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys


def capabilities(names):
    return {'ok': True, 'tools': {name: {'status': 'available' if shutil.which(name) else 'missing',
                                      'path': shutil.which(name)} for name in names}}


def search(args):
    try:
        result = subprocess.run(['rg', *args], capture_output=True, text=True, timeout=30)
        if result.returncode in (0, 1):
            return {'ok': True, 'status': 'matches' if result.returncode == 0 else 'no_matches', 'output': result.stdout}
        return {'ok': False, 'status': 'search_error', 'error': result.stderr, 'exitCode': result.returncode}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'ok': False, 'status': 'search_unavailable', 'error': str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capabilities', 'search'], nargs='?', default='capabilities')
    parser.add_argument('args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    result = search(args.args) if args.action == 'search' else capabilities(args.args or ['git', 'uv', 'python3', 'pdflatex', 'tectonic'])
    print(json.dumps(result))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
