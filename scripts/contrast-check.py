#!/usr/bin/env python3
"""WCAG contrast for the colours in src/styles/main.css.

The palette is the dark editorial one: near-black ground, light ink, one
violet interactive accent, one teal informational accent. Run this after any
token change; a pair that fails AA at body size is a bug, not a taste call.
"""
def lum(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, (r, g, b))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def cr(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def blend(fg, bg, alpha):
    return ''.join(f'{round(int(fg[i:i + 2], 16) * alpha + int(bg[i:i + 2], 16) * (1 - alpha)):02x}' for i in (0, 2, 4))


BG = '0b0b0f'
CARD = blend('111119', BG, 0.84)
CARD_HOVER = blend('181822', BG, 0.92)
ACCENT = '7c6cff'
ACCENT_DIM = '3a2f8f'
ACCENT2 = '00d9b8'

pairs = [
    ('fg on bg', 'e8e8ee', BG, 4.5),
    ('fg-dim on bg', '8a8a95', BG, 4.5),
    ('fg-mute on bg', '858592', BG, 4.5),
    ('fg-dim on card', '8a8a95', CARD, 4.5),
    ('fg-mute on card', '858592', CARD, 4.5),
    ('fg-mute on card hover', '858592', CARD_HOVER, 4.5),
    ('accent2 on bg', ACCENT2, BG, 4.5),
    ('nav active, white on accent-dim', 'ffffff', ACCENT_DIM, 4.5),
    ('primary button, bg on accent', BG, ACCENT, 4.5),
    ('primary hover, bg on accent-soft', BG, '8e7fff', 4.5),
    # Kept as a record: this pair is why the primary button uses bg ink.
    ('the retired white on accent', 'ffffff', ACCENT, None),
]

failed = 0
for name, fg, bg, need in pairs:
    ratio = cr(fg, bg)
    if need is None:
        print(f'INFO  {ratio:5.2f}:1  {name}')
        continue
    ok = ratio >= need
    if not ok:
        failed += 1
    print(f'{"PASS" if ok else "FAIL"}  {ratio:5.2f}:1  {name}')

raise SystemExit(1 if failed else 0)
