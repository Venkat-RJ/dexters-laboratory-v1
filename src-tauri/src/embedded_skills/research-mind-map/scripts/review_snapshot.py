"""Print evidence identity for a recorded agent review. Does not produce a verdict."""
import hashlib
import json
from pathlib import Path
import sys


def snapshot(root):
    root = Path(root).resolve()
    state = json.loads((root / 'research-state.json').read_text(encoding='utf-8'))
    required = ['formulation.tex', 'prior-knowledge.tex', 'sources/search-plan.md',
                'sources/prior-knowledge.md', 'mind-map.json']
    paths = list(dict.fromkeys(required + state.get('evidencePaths', [])))
    artifacts = []
    for name in paths:
        if not isinstance(name, str) or any(c in name for c in ':\\#') or any(p in ('', '.', '..') for p in name.split('/')):
            raise ValueError('Unsafe evidence path')
        path = (root / name).resolve()
        if not path.is_relative_to(root):
            raise ValueError('Evidence must stay inside the project')
        # Preserve CRLF exactly, matching the frontend file reader.
        artifacts.append({'path': name, 'content': path.read_bytes().decode('utf-8')})
    topics = json.loads(next(a['content'] for a in artifacts if a['path'] == 'mind-map.json'))['topics']
    encoded = json.dumps(artifacts, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return {'fingerprint': hashlib.sha256(encoded).hexdigest(),
            'topicIds': [t['id'] for t in topics], 'evidencePaths': paths}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: review_snapshot.py PROJECT_ROOT')
    print(json.dumps(snapshot(sys.argv[1]), ensure_ascii=False, indent=2))
