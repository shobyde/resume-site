#!/usr/bin/env python3
"""WCAG contrast for the "working record" palette.

Cold canvas, ink, cobalt interaction, acid highlight. Run after any token
change; a pair that fails AA at body size is a bug, not a taste call.
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


CANVAS = 'e9edf0'
SURFACE = 'fbfcfc'
INK = '0b1220'
DIM = '46515f'
MUTE = '5f6a76'
COBALT = '1b3cff'
ACID = 'e4ff3d'
INK_BG = '0b1220'
INK_FG = 'f4f6f7'
INK_DIM = 'a9b4c1'

pairs = [
    ('ink on canvas', INK, CANVAS, 4.5),
    ('dim on canvas', DIM, CANVAS, 4.5),
    ('mute on canvas', MUTE, CANVAS, 4.5),
    ('ink on surface', INK, SURFACE, 4.5),
    ('dim on surface', DIM, SURFACE, 4.5),
    ('cobalt on canvas', COBALT, CANVAS, 4.5),
    ('cobalt on surface', COBALT, SURFACE, 4.5),
    ('ink on acid', INK, ACID, 4.5),
    ('acid on ink', ACID, INK_BG, 4.5),
    ('ink-fg on ink', INK_FG, INK_BG, 4.5),
    ('ink-dim on ink', INK_DIM, INK_BG, 4.5),
    ('white on cobalt', 'ffffff', COBALT, 4.5),
    ('white on inert ink', 'ffffff', '1b2635', 4.5),
]

failed = 0
for name, fg, bg, need in pairs:
    ratio = cr(fg, bg)
    ok = ratio >= need
    if not ok:
        failed += 1
    print(f'{"PASS" if ok else "FAIL"}  {ratio:5.2f}:1  {name}')

raise SystemExit(1 if failed else 0)
