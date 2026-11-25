"""Bygger public/index.html ud fra prototypen (madscanner.html) og kobler den til mm.js."""
import pathlib, sys, hashlib
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'madscanner.html').read_text()
head = ('<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
        '<link rel="icon" href="/icon-192.png"><meta name="theme-color" content="#F1F1F4"><link rel="stylesheet" href="/mm.css">'
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="/mm.js"></script>')
js_ver = hashlib.sha1((pathlib.Path('public/mm.js').read_text() + pathlib.Path('public/mm.css').read_text()).encode()).hexdigest()[:8]
head = head.replace('/mm.js"', f'/mm.js?v={js_ver}"').replace('/mm.css"', f'/mm.css?v={js_ver}"')
ver = hashlib.sha1((src + js_ver).encode()).hexdigest()[:10]
head = f'<meta name="mm-version" content="{ver}">' + head
pathlib.Path('public/version.txt').write_text(ver)
assert '</title>' in src
out = src.replace('</title>', '</title>' + head, 1)
pathlib.Path('public/index.html').write_text(out)
print('public/index.html bygget', len(out))
# Engelsk version: /en/ + /mm.en.js
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / 'i18n'))
import build_en
en = build_en.build_html(src).replace('</title>', '</title>' + head.replace('/mm.js', '/mm.en.js'), 1)
pathlib.Path('public/en').mkdir(exist_ok=True)
pathlib.Path('public/en/index.html').write_text(en)
pathlib.Path('public/mm.en.js').write_text(build_en.build_js(pathlib.Path('public/mm.js').read_text()))
print('public/en/index.html bygget', len(en))
