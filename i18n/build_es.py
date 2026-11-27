"""Build Spanish version of madscanner.html -> stdout path arg.
usage: python3 build_en.py in.html out.html [--leftovers]"""
import re, json, sys, importlib.util, os
D = os.path.dirname(os.path.abspath(__file__))
segs = json.load(open(f'{D}/segs.json'))
M = json.load(open(f'{D}/es.json'))

def tr(piece, q=None):
    st = piece.strip()
    if st in M:
        a = piece[:len(piece) - len(piece.lstrip())]; b = piece[len(piece.rstrip()):]
        v = M[st]
        if q == '&': v = v.replace('"', '&quot;')
        elif q: v = re.sub(r'(?<!\\)' + re.escape(q), lambda m: '\\' + q, v)
        return a + v + b
    return piece

left = set()
DA = re.compile(r'[æøåÆØÅ]|\b(og|ikke|du|dig|din|dine|er|på|til|med|for|der|det|hvad|hvor|når|kan|skal|fra|efter|før|eller|mere|lidt)\b')
ALL = set()
def note(p):
    st = p.strip()
    if st and st not in M and re.search(r'[A-Za-zæøåÆØÅ]{2}', st): ALL.add(st)
    if st and st not in M and DA.search(st) and re.search(r'[a-zæøå]{2}', st, re.I): left.add(st)

# HTML: text nodes + some attributes (skip style)
def html_tr(h):
    parts = re.split(r'(<style>.*?</style>)', h, flags=re.S)
    out = []
    for p in parts:
        if p.startswith('<style>'): out.append(p); continue
        p = re.sub(r'>([^<>]+)<', lambda m: '>' + (note(m.group(1)) or tr(m.group(1))) + '<', p)
        p = re.sub(r'\b(placeholder|aria-label|title|content|data-w|alt)="([^"]*)"',
                   lambda m: f'{m.group(1)}="{(note(m.group(2)) or tr(m.group(2), "&"))}"', p)
        out.append(p)
    return ''.join(out)

def lit_tr(m):
    q = m.group(0)[0]; body = m.group(0)[1:-1]
    pieces = re.split(r'(\$\{(?:[^{}]|\{[^{}]*\})*\}|<[^>]+>)', body)
    res = []
    for i, pc in enumerate(pieces):
        if i % 2:
            # attributes inside tags in templates
            pc = re.sub(r'\b(placeholder|aria-label|title|data-w|alt)="([^"$]*)"', lambda mm: f'{mm.group(1)}="{tr(mm.group(2))}"', pc)
            res.append(pc)
        else:
            note(pc); res.append(tr(pc))
    return q + ''.join(res) + q

REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
def attr_tr(v, q):
    r = tr(v, '&')
    if r != v and q in ("'", '`'): r = r.replace(q, '\\' + q)
    return r

def text_tr(chunk, q=None):
    # chunk: raw text of string/template part; split at tags
    pieces = re.split(r'(<[^>]*>|^[^<>]*>|<[^>]*$)', chunk)
    res = []
    for i, pc in enumerate(pieces):
        if i % 2:
            pc = re.sub(r'\b(placeholder|aria-label|title|data-w|alt)="([^"]*)"', lambda mm: mm.group(1) + '="' + attr_tr(mm.group(2), q) + '"', pc)
            res.append(pc)
        else:
            note(pc); res.append(tr(pc, q))
    return ''.join(res)

def js_tr(j, i=0, stop=None):
    """returns (out, index). stop='}' ends at matching brace for template expr."""
    out = []; n = len(j); depth = 0; prev = '('
    while i < n:
        c = j[i]
        if stop and c == '}' and depth == 0:
            return ''.join(out), i
        if c == '{': depth += 1
        elif c == '}': depth -= 1
        if c == '/' and j.startswith('//', i):
            e = j.find('\n', i); e = n if e < 0 else e
            out.append(j[i:e]); i = e; continue
        if c == '/' and j.startswith('/*', i):
            e = j.find('*/', i) + 2; out.append(j[i:e]); i = e; continue
        if c == '/' and (prev in REGEX_PREV or re.search(r'(return|typeof|case)\s*$', ''.join(out[-3:]))):
            k = i + 1; cls = False
            while k < n:
                ch = j[k]
                if ch == '\\': k += 2; continue
                if ch == '[': cls = True
                elif ch == ']': cls = False
                elif ch == '/' and not cls: break
                elif ch == '\n': break
                k += 1
            k += 1
            while k < n and j[k].isalpha(): k += 1
            out.append(j[i:k]); i = k; prev = 'x'; continue
        if c in '"\'':
            k = i + 1
            while k < n and j[k] != c:
                if j[k] == '\\': k += 1
                k += 1
            out.append(c + text_tr(j[i+1:k], c) + c); i = k + 1; prev = 'x'; continue
        if c == '`':
            out.append('`'); k = i + 1; buf = ''
            while k < n:
                ch = j[k]
                if ch == '\\': buf += j[k:k+2]; k += 2; continue
                if ch == '`': break
                if ch == '$' and j.startswith('${', k):
                    out.append(text_tr(buf, '`')); buf = ''
                    sub, k2 = js_tr(j, k + 2, stop='}')
                    out.append('${' + sub + '}'); k = k2 + 1; continue
                buf += ch; k += 1
            out.append(text_tr(buf, '`') + '`'); i = k + 1; prev = 'x'; continue
        out.append(c)
        if not c.isspace(): prev = c if not (c.isalnum() or c in '_$') else 'x'
        i += 1
    return ''.join(out), i

def build_html(src):
    head, sep, js = src.partition('<script>')
    # JS may contain later </script><script> blocks with html between; treat simply
    blocks = re.split(r'(</script>.*?<script[^>]*>)', js, flags=re.S)
    jsout = ''.join(html_tr(b) if b.startswith('</script>') else js_tr(b)[0] for b in blocks)
    out = html_tr(head) + sep + jsout
    
    # structural fixes
    out = out.replace('<html lang="da">', '<html lang="es">')
    out = out.replace("'da-DK'", "'es-ES'")
    for a, b in [('morgenloeft.mp3', 'morning-lift-en.mp3'), ('aftenro.mp3', 'evening-calm-en.mp3'), ('bodyscan.mp3', 'bodyscan-en.mp3')]:
        out = out.replace(a, b)
    out = out.replace("return m%1?`${hh}.30`:`${hh}`;", "return m%1?`${hh}:30`:`${hh}:00`;")
    for da, en in [('Morgenmad', 'Desayuno'), ('Frokost', 'Almuerzo'), ('Eftermiddag', 'Merienda'), ('Aftensmad', 'Cena'), ('Aftensnack', 'Tentempié nocturno')]:
        out = re.sub(r'([{,]\s*)' + da + r':\[', lambda m: f"{m.group(1)}'{en}':[", out)
    return out

def build_js(src):
    return js_tr(src)[0]

if __name__ == '__main__':
    src = open(sys.argv[1]).read()
    out = build_js(src) if sys.argv[1].endswith('.js') else build_html(src)
    open(sys.argv[2], 'w').write(out)
    if '--leftovers' in sys.argv:
        json.dump(sorted(left, key=len, reverse=True), open(f'{D}/left_es.json', 'w'), ensure_ascii=False, indent=0)
        print(len(left), 'leftovers')
        pass
    print('mapped', len(M))
    