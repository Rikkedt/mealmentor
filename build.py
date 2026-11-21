"""Bygger public/index.html ud fra prototypen (madscanner.html) og kobler den til mm.js."""
import pathlib, sys
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'madscanner.html').read_text()
head = ('<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
        '<meta name="theme-color" content="#F1F1F4"><link rel="stylesheet" href="/mm.css">'
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="/mm.js"></script>')
assert '</title>' in src
out = src.replace('</title>', '</title>' + head, 1)
pathlib.Path('public/index.html').write_text(out)
print('public/index.html bygget', len(out))
