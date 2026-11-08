"""Check repository links and the built static entry using only the standard library."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import csv
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
errors = []

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attr in ('src', 'href'):
            if attr in attrs:
                self.links.append(attrs[attr])

readme = (ROOT / 'README.md').read_text(encoding='utf-8')
parser = Links()
parser.feed(readme)
links = parser.links + re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', readme)
anchors = set(re.findall(r'id="([^"]+)"', readme))
for heading in re.findall(r'^#{1,6}\s+(.+)$', readme, re.MULTILINE):
    slug = re.sub(r'[^\w\s-]', '', heading.lower()).replace(' ', '-')
    anchors.add(slug)
for link in links:
    parts = urlsplit(link)
    if parts.scheme or parts.netloc:
        continue
    if parts.path and not (ROOT / unquote(parts.path)).exists():
        errors.append(f'Broken README file link: {link}')
    if not parts.path and parts.fragment and unquote(parts.fragment) not in anchors:
        errors.append(f'Broken README anchor: {link}')

entry = Links()
entry.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
for link in entry.links:
    if not link.startswith('./') or not (ROOT / link).is_file():
        errors.append(f'Invalid static resource: {link}')
for required in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'source/app/page.tsx', 'source/package.json', 'source/pnpm-lock.yaml']:
    if not (ROOT / required).is_file():
        errors.append(f'Missing publication file: {required}')
bundle = next((ROOT / 'assets').glob('*.js')).read_text(encoding='utf-8')
for path in ['templates/ads-report-template.csv', 'templates/product-mapping-template.csv']:
    if './' + path not in bundle or not (ROOT / path).is_file():
        errors.append(f'Missing template: {path}')
    if (ROOT / path).read_bytes() != (ROOT / 'source/public' / path).read_bytes():
        errors.append(f'Template differs from source: {path}')
for text in ['请严格按照模板表字段顺序配制Reports-Custom Reports的字段顺序才能导入分析！', '粤ICP备2026054366号-1', 'https://calos985.github.io/', 'https://carloswiki.com/blog/']:
    if text not in bundle:
        errors.append(f'Missing expected UI text or link: {text}')
for image in sorted((ROOT / 'docs/images/screenshots').glob('*.png')):
    width, height = struct.unpack('>II', image.read_bytes()[16:24])
    print(f'{image.name}: {width}x{height}')
with (ROOT / 'templates/ads-report-template.csv').open(encoding='utf-8-sig', newline='') as handle:
    rows = list(csv.reader(handle))
    assert len(rows[1]) == 15
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Publication checks passed: {len(links)} README links, {len(entry.links)} entry resources, templates and required UI content.')
