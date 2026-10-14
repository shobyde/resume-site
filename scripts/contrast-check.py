#!/usr/bin/env python3
"""WCAG contrast of the sepia ink palette against the parchment-dark bg."""
def lum(h):
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, (r, g, b))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def cr(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

bg = '1a1714'
for name, c in [('fg', 'eadbbf'), ('fg-dim', 'c3ac8a'), ('fg-mute', '95805f'),
                ('accent', 'b0763c'), ('accent2', '9c8452')]:
    print(name, round(cr(c, bg), 2))
