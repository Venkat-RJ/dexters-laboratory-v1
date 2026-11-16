#!/usr/bin/env python3
"""Check a source export before sharing. Does not stage, commit or upload files."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
parser.add_argument('--private-pattern', action='append', default=[], help='Additional private text regex to reject; contents are never printed.')
args = parser.parse_args()
root = args.root.resolve()
# Generated trees are excluded from source review, and must not be distributed.
skipped = {'.git', 'node_modules', 'target', 'dist', '.venv', '__pycache__'}
forbidden_roots = {'research', 'private', '.claude', '.amp', '.codex'}
secret_patterns = [
    r'(?<![A-Za-z0-9_-])sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}',
    r'(?<![A-Za-z0-9_-])gh[pousr]_[A-Za-z0-9]{30,}',
    r'github_pat_[A-Za-z0-9_]{40,}',
    r'AKIA[A-Z0-9]{16}',
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
]
checks = [('credential-pattern', re.compile(p)) for p in secret_patterns]
checks += [('private-pattern', re.compile(p, re.I)) for p in args.private_pattern]
findings = []
files = 0
skipped_trees = []
for base, dirs, names in os.walk(root, followlinks=False):
    for name in list(dirs):
        p = Path(base) / name
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            findings.append({'path': rel, 'reason': 'symlink'})
            dirs.remove(name)
        elif name in skipped:
            skipped_trees.append(rel)
            dirs.remove(name)
        elif p.parent == root and name in forbidden_roots:
            findings.append({'path': rel, 'reason': 'private-directory'})
            dirs.remove(name)
    for name in names:
        p = Path(base) / name
        rel = p.relative_to(root).as_posix()
        files += 1
        if p.is_symlink():
            findings.append({'path': rel, 'reason': 'symlink'})
            continue
        if (name.startswith('.env') and name != '.env.example') or p.suffix.lower() in {'.pem', '.p12', '.pfx', '.key', '.sqlite', '.sqlite3', '.db'}:
            findings.append({'path': rel, 'reason': 'credential-or-local-data-file'})
        try:
            content = p.read_text(encoding='utf-8')
        except UnicodeError:
            continue
        for line, text in enumerate(content.splitlines(), 1):
            for label, pattern in checks:
                if pattern.search(text):
                    findings.append({'path': rel, 'line': line, 'reason': label})
print(json.dumps({'files_checked': files, 'findings': findings, 'excluded_generated_trees': skipped_trees,
                  'limitation': 'Pattern review does not prove absence of confidential data. Review source and binaries separately.'}, indent=2))
sys.exit(1 if findings else 0)
