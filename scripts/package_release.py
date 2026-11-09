"""Package the deployable site without development files or private reports."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--site-dir', default='.', help='Built site directory, relative to the repository')
parser.add_argument('--version', default=json.loads((ROOT / 'source/package.json').read_text())['version'])
args = parser.parse_args()
site = (ROOT / args.site_dir).resolve()
if site != ROOT and ROOT not in site.parents:
    parser.error('--site-dir must stay inside this repository')
if not all(char.isalnum() or char in '.-_' for char in args.version):
    parser.error('Version contains invalid filename characters')
files = []
for name in ['index.html', 'favicon.svg', 'og.png']:
    path = site / name
    if not path.is_file():
        parser.error(f'Missing built file: {path}')
    files.append((path, name))
for directory in ['assets', 'templates']:
    folder = site / directory
    if not folder.is_dir():
        parser.error(f'Missing built directory: {folder}')
    files.extend((path, path.relative_to(site).as_posix()) for path in folder.rglob('*') if path.is_file())
for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
    files.append((ROOT / name, name))
files.extend((path, path.relative_to(ROOT).as_posix()) for path in (ROOT / 'docs/licenses').glob('*.txt'))
output = ROOT / 'release'
output.mkdir(exist_ok=True)
archive = output / f'walmart-ads-trends-v{args.version}-static.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for path, name in sorted(files, key=lambda entry: entry[1]):
        package.write(path, name)
    package.writestr('README-DEPLOY.txt', '''Walmart Ads Trends / Walmart 广告趋势看板

Upload and extract this package inside your static site's directory.
Keep index.html, assets/, templates/, favicon.svg and og.png at that directory's top level.
Use a directory URL with a trailing slash, then hard-refresh the browser.
No Node.js or server-side application is needed.

将本包上传到静态网站目录后直接解压，让 index.html、assets、templates 位于该目录内。
不要额外嵌套一层文件夹。访问带末尾斜杠的网址并按 Ctrl+F5 刷新。
无需 Node.js。广告报表在浏览器中处理。

Live demo: https://carloswiki.com/Walmart%20Trends/
Source: https://github.com/CALOS985/walmart-ads-trends
''')
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert 'index.html' in package.namelist()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
print(f'{archive.name}: {archive.stat().st_size} bytes')
print(f'SHA256: {digest}')
