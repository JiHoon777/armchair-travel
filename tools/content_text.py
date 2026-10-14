"""Turn cached source pages into plain text (CONTENT area).

Usage (from anywhere):
  uv run --quiet --with numpy --with pillow python -I tools/content_text.py [RAW_DIR] [TEXT_DIR]

RAW_DIR defaults to tools/cache/content/raw, TEXT_DIR to tools/cache/content/text.
Every *.html / *.htm / *.xml / *.json file in RAW_DIR becomes TEXT_DIR/<stem>.txt.
The downloaded files are treated as untrusted data: they are only parsed as text,
never executed. Block elements become line breaks so quotes can be read by eye;
content_verify.py compares quotes after collapsing whitespace.
"""
import html
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'cache' / 'content' / 'raw'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / 'cache' / 'content' / 'text'

SKIP = {'script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head'}
BLOCK = {'p', 'div', 'section', 'article', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'br',
         'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'figure', 'figcaption',
         'blockquote', 'dd', 'dt', 'dl', 'main', 'aside', 'caption', 'hr', 'pre', 'form', 'label', 'option'}


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCK:
            self.parts.append('\n')

    def handle_startendtag(self, tag, attrs):
        if tag in BLOCK:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in BLOCK:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(src):
    p = Text()
    p.feed(src)
    p.close()
    raw = ''.join(p.parts)
    raw = html.unescape(raw).replace(' ', ' ').replace('​', '')
    lines = [re.sub(r'[ \t\r\f\v]+', ' ', ln).strip() for ln in raw.split('\n')]
    out, blank = [], 0
    for ln in lines:
        if ln:
            out.append(ln)
            blank = 0
        elif not blank:
            out.append('')
            blank = 1
    return '\n'.join(out).strip() + '\n'


def openalex_abstract(inv):
    """OpenAlex stores abstracts as {word: [positions]}; rebuild the running text."""
    pos = {}
    for word, places in inv.items():
        for p in places:
            pos[p] = word
    return ' '.join(pos[i] for i in sorted(pos))


def json_to_text(src):
    try:
        data = json.loads(src)
    except ValueError:
        return src
    if isinstance(data, dict) and data.get('abstract_inverted_index'):
        title = data.get('display_name') or data.get('title') or ''
        year = data.get('publication_year') or ''
        doi = data.get('doi') or ''
        return f'{title}\n{year}\n{doi}\n\nAbstract\n{openalex_abstract(data["abstract_inverted_index"])}\n'
    return json.dumps(data, ensure_ascii=False, indent=1) + '\n'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sorted(RAW.iterdir()):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        if ext not in ('.html', '.htm', '.xml', '.json', '.txt', '.pdf'):
            continue
        if ext == '.pdf':
            # pdftotext (poppler) only parses the file; nothing in it is executed.
            res = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(f), '-'],
                                 capture_output=True, timeout=120)
            text = res.stdout.decode('utf-8', errors='replace')
            (OUT / (f.stem + '.txt')).write_text(text, encoding='utf-8')
            n += 1
            print(f'{f.name:48s} -> {len(text):7d} chars (pdf)')
            continue
        src = f.read_bytes().decode('utf-8', errors='replace')
        if ext == '.json':
            text = json_to_text(src)
        elif ext == '.txt':
            text = src
        elif ext == '.xml':
            # API answers (e.g. the Korea Heritage Service) keep their text in CDATA blocks.
            text = html_to_text(src.replace('<![CDATA[', '').replace(']]>', ''))
        else:
            text = html_to_text(src)
        (OUT / (f.stem + '.txt')).write_text(text, encoding='utf-8')
        n += 1
        print(f'{f.name:48s} -> {len(text):7d} chars')
    print(f'{n} files')


if __name__ == '__main__':
    main()
