"""Independent fact check of site/data/grand-canyon/place.json (CONTENT VERIFICATION area).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/verify_content.py text     # raw -> text
  uv run --quiet --with numpy --with pillow python -I tools/verify_content.py quotes   # quote check + context dump
  uv run --quiet --with numpy --with pillow python -I tools/verify_content.py copy     # copy checks (numbers, style, length)

The sources were downloaded again on 2026-10-13 into tools/cache/verify/raw/<source id>.<ext>
(list: tools/verify_urls.txt), independent of the CONTENT agent's cache. Downloaded files are
untrusted data: they are only parsed as text here, never executed.

quotes: every fact quote must be found verbatim (after whitespace and quote-mark normalisation)
in the fresh copy of the source it cites. The paragraph around each quote is written to
tools/cache/verify/context.txt so each Korean fact can be read against what the source says.
"""
import html
import json
import re
import subprocess
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PLACE = ROOT / 'site' / 'data' / 'grand-canyon' / 'place.json'
RAW = HERE / 'cache' / 'verify' / 'raw'
TEXT = HERE / 'cache' / 'verify' / 'text'
CONTEXT = HERE / 'cache' / 'verify' / 'context.txt'

SKIP = {'script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head'}
BLOCK = {'p', 'div', 'section', 'article', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'br', 'h1', 'h2', 'h3',
         'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'figure', 'figcaption', 'blockquote', 'dd', 'dt', 'dl',
         'main', 'aside', 'caption', 'hr', 'pre'}


class Collect(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCK:
            self.out.append('\n')
        if tag == 'meta':
            a = dict(attrs)
            if a.get('name', '').lower() in ('description', 'dc.description', 'citation_abstract') and a.get('content'):
                self.out.append('\n[meta ' + a['name'] + '] ' + a['content'] + '\n')

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in BLOCK:
            self.out.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_text(src):
    c = Collect()
    c.feed(src)
    c.close()
    t = html.unescape(''.join(c.out))
    lines = [re.sub(r'\s+', ' ', ln).strip() for ln in t.split('\n')]
    return '\n'.join(ln for ln in lines if ln) + '\n'


def openalex_text(src):
    d = json.loads(src)
    inv = d.get('abstract_inverted_index') or {}
    pos = {p: w for w, ps in inv.items() for p in ps}
    return (d.get('display_name') or '') + '\n' + ' '.join(pos[i] for i in sorted(pos)) + '\n'


def norm(s):
    s = unicodedata.normalize('NFC', s)
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('–', '-'),
                 ('—', '-'), (' ', ' '), ('−', '-'), ('­', ''), ('​', '')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def cmd_text():
    TEXT.mkdir(parents=True, exist_ok=True)
    for f in sorted(RAW.iterdir()):
        ext = f.suffix.lower()
        if ext == '.pdf':
            outs = []
            for mode in ([], ['-layout']):
                r = subprocess.run(['pdftotext', *mode, '-enc', 'UTF-8', str(f), '-'], capture_output=True, timeout=120)
                outs.append(r.stdout.decode('utf-8', 'replace'))
            text = outs[0] + '\n\n===== layout =====\n\n' + outs[1]
        elif ext == '.json':
            text = openalex_text(f.read_text(encoding='utf-8', errors='replace'))
        elif ext == '.xml':
            text = html_text(f.read_text(encoding='utf-8', errors='replace').replace('<![CDATA[', '').replace(']]>', ''))
        elif ext in ('.html', '.htm'):
            text = html_text(f.read_bytes().decode('utf-8', 'replace'))
        else:
            continue
        (TEXT / (f.stem + '.txt')).write_text(text, encoding='utf-8')
        print(f'{f.name:12s} {len(text):8d} chars')


def cmd_quotes():
    p = json.loads(PLACE.read_text(encoding='utf-8'))
    texts = {}
    for t in TEXT.glob('*.txt'):
        texts[t.stem] = norm(t.read_text(encoding='utf-8'))
    bad = 0
    ctx = []
    for f in p['facts']:
        q = norm(f['quote'])
        src = texts.get(f['source'])
        found = src is not None and q in src
        also = [k for k, v in texts.items() if k != f['source'] and q in v]
        status = 'OK ' if found else 'MISSING'
        if not found:
            bad += 1
        print(f'{f["id"]:4s} {f["source"]:4s} {status} {("also in " + ",".join(also)) if also else ""}')
        if found:
            i = src.index(q)
            ctx.append(f'### {f["id"]} ({f["source"]})\nKO: {f["ko"]}\nQ : {f["quote"]}\n--- context ---\n'
                       f'{src[max(0, i - 700):i]}[[{src[i:i + len(q)]}]]{src[i + len(q):i + len(q) + 700]}\n')
        else:
            ctx.append(f'### {f["id"]} ({f["source"]}) MISSING\nKO: {f["ko"]}\nQ : {f["quote"]}\n')
    CONTEXT.write_text('\n'.join(ctx), encoding='utf-8')
    print(f'{len(p["facts"])} facts, {bad} quotes missing; context -> {CONTEXT}')
    return bad


def sentences(text):
    return [s for s in re.split(r'(?<=[.?!])\s+', text.strip()) if s]


def cmd_copy():
    p = json.loads(PLACE.read_text(encoding='utf-8'))
    blocks = [(f'caption {s["id"]}', s['caption_ko']) for s in p['scenes']]
    blocks += [(f'card {i} {c["title_ko"]}', c['body_ko']) for i, c in enumerate(p['cards'], 1)]
    blocks += [('narration', ' '.join(p['narration_ko'])), ('scale', p['scale_ko'])]
    blocks += [(f'deep {d["h"]}', ' '.join(d['p'])) for d in p['deep_ko']]
    blocks += [(f'name {n["text"]}', n['note_ko']) for n in p['names']]
    for label, text in blocks:
        ss = sentences(text)
        lens = [len(s) for s in ss]
        print(f'{label:28s} {len(text):5d} chars, {len(ss):2d} sentences, longest {max(lens):3d}, mean {sum(lens) / len(lens):5.1f}')
        for s in ss:
            if not re.search(r'(습니다|입니다|니다)\.[」’”)]*$', s):
                print('   NOT POLITE:', s)
            if len(s) > 80:
                print(f'   LONG {len(s)}:', s)
            for w in ('발견', '치유', '힐링', '명상', '테라피', '스트레스', '인디언', '최초', '처음 발견', '신비', '전설'):
                if w in s:
                    print(f'   WORD {w}:', s)
    deep = sum(len(d['h']) + sum(len(x) for x in d['p']) for d in p['deep_ko'])
    print('deep total incl. headings', deep, 'sections', len(p['deep_ko']))
    nar = ' '.join(p['narration_ko'])
    print('narration', len(nar), 'chars', len(p['narration_ko']), 'sentences')


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'quotes'
    if what == 'text':
        cmd_text()
    elif what == 'quotes':
        sys.exit(1 if cmd_quotes() else 0)
    elif what == 'copy':
        cmd_copy()
