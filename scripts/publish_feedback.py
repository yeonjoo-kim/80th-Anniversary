"""Publish a public /feedback/ snapshot without changing main or the current checkout.
Run after committing tested changes: python3 scripts/publish_feedback.py --publish
GitHub Pages root files are copied from main; feedback/ contains the committed app.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import textwrap

REPO = 'yeonjoo-kim/80th-Anniversary'
BRANCH = 'codex/public-feedback'
URL = 'https://yeonjoo-kim.github.io/80th-Anniversary/feedback/'
ROOT = Path(__file__).resolve().parents[1]

def run(*args, data=None, env=None):
    return subprocess.run(args, cwd=ROOT, input=data, text=True, check=True,
                          stdout=subprocess.PIPE, env=env).stdout.strip()

def workflow(commit):
    files = ['index.html', 'app.js', 'archive.js', 'styles.css', 'assets/audio/tap-1.wav']
    expected = {}
    for name in files:
        body = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=ROOT)
        expected[name] = hashlib.sha256(body).hexdigest()
    expected[''] = expected['index.html']
    check = f'''import hashlib, time, urllib.request
expected = {expected!r}
for attempt in range(24):
    try:
        for path, digest in expected.items():
            request = urllib.request.Request({URL!r} + path, headers={{"User-Agent":"Anonymous-feedback-check"}})
            with urllib.request.urlopen(request, timeout=20) as response:
                assert response.status == 200
                if path.endswith(".wav"): assert response.headers.get_content_type().startswith("audio/")
                assert hashlib.sha256(response.read()).hexdigest() == digest, "Snapshot still updating"
        print("PASS: anonymous HTTPS access; index, script, stylesheet and audio match the published revision")
        break
    except Exception as error:
        print(f"Waiting for Pages, attempt {{attempt+1}}: {{type(error).__name__}}", flush=True)
        time.sleep(10)
else:
    raise SystemExit("Public feedback deployment did not become ready")
'''
    header = '''name: Public feedback anonymous access
on:
  push:
    branches: [codex/public-feedback]
permissions: {}
jobs:
  public-access:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Verify actual anonymous HTTPS responses
        shell: bash
        run: |
          python3 - <<'CHECK'
'''
    return header + textwrap.indent(check, '          ') + '          CHECK\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true', help='Push the snapshot and select its Pages source')
    args = parser.parse_args()
    commit = run('git', 'rev-parse', 'HEAD')
    if run('git', 'branch', '--show-current') == BRANCH:
        raise SystemExit('Run from the app branch, not from the generated deployment branch')
    if not args.publish:
        print(json.dumps({'url': URL, 'code_commit': commit, 'pages_branch': BRANCH,
                          'main_writes': False, 'action': 'Pass --publish after validating and committing the app'}))
        return
    if run('git', 'status', '--porcelain'):
        raise SystemExit('Commit the tested changes before publishing a snapshot')
    run('git', 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main')
    pages = json.loads(run('gh', 'api', f'repos/{REPO}/pages'))
    source = pages.get('source', {})
    if source.get('branch') not in ['main', BRANCH] or source.get('path') != '/':
        raise SystemExit('Pages source was changed externally; inspect before replacing it')
    if run('git', 'ls-tree', 'origin/main', 'feedback'):
        raise SystemExit('main already contains feedback/; preserve it before publishing')
    workflow_path = '.github/workflows/codex-public-feedback-check.yml'
    if run('git', 'ls-tree', 'origin/main', workflow_path):
        raise SystemExit('main already contains the managed verification workflow path')
    workflow_blob = run('git', 'hash-object', '-w', '--stdin', data=workflow(commit))
    empty_blob = run('git', 'hash-object', '-w', '--stdin', data='')
    import os
    with tempfile.TemporaryDirectory(prefix='80th-feedback-') as temporary:
        env = {**os.environ, 'GIT_INDEX_FILE': str(Path(temporary)/'index')}
        run('git', 'read-tree', 'origin/main', env=env)
        run('git', 'read-tree', '--prefix=feedback/', commit, env=env)
        if not run('git', 'ls-tree', 'origin/main', '.nojekyll'):
            run('git', 'update-index', '--add', '--cacheinfo', f'100644,{empty_blob},.nojekyll', env=env)
        run('git', 'update-index', '--add', '--cacheinfo', f'100644,{workflow_blob},{workflow_path}', env=env)
        tree = run('git', 'write-tree', env=env)
    # Check every preexisting main root entry remains byte-for-byte the same.
    for line in run('git', 'ls-tree', 'origin/main').splitlines():
        name = line.split('\t', 1)[1]
        if name == '.github':
            continue  # only the new verification file is added under this directory
        if run('git', 'ls-tree', tree, name) != line:
            raise SystemExit(f'Unexpected change to existing Pages root: {name}')
    previous = run('git', 'ls-remote', 'origin', f'refs/heads/{BRANCH}')
    parent = []
    if previous:
        run('git', 'fetch', 'origin', f'refs/heads/{BRANCH}')
        parent = ['-p', previous.split()[0]]
    snapshot = run('git', 'commit-tree', tree, *parent,
                   data=f'Publish public feedback snapshot of {commit}\n')
    run('git', 'push', 'origin', f'{snapshot}:refs/heads/{BRANCH}')
    if source.get('branch') != BRANCH:
        run('gh', 'api', '--method', 'PUT', f'repos/{REPO}/pages', '--input', '-',
            data=json.dumps({'source': {'branch': BRANCH, 'path': '/'}}))
    print(json.dumps({'public_url': URL, 'code_commit': commit,
                      'snapshot_commit': snapshot, 'pages_branch': BRANCH,
                      'main_root_preserved': True, 'main_branch_changed': False}))

if __name__ == '__main__':
    main()
