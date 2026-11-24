#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Disegna l'icona del Cielo di Einstein@Home: sfera celeste con griglia, la Terra al centro,
una pulsar con i due fasci e l'orbita di Fermi.   © 2026 Edoardo Battistel
Crea web/cielo_einstein.png (512), web/cielo_einstein.ico (16-256) e web/icona.png (256)."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 1024                                       # si disegna grande e poi si rimpicciolisce


def icona():
    random.seed(7)
    fondo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    maschera = Image.new("L", (S, S), 0)
    ImageDraw.Draw(maschera).rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 5, fill=255)
    cielo = Image.new("RGBA", (S, S), (6, 9, 26, 255))
    d = ImageDraw.Draw(cielo)
    for y in range(S):                         # sfumatura blu notte
        t = y / S
        d.line([(0, y), (S, y)], fill=(int(8 + 10 * t), int(10 + 8 * t), int(34 - 10 * t), 255))
    for _ in range(260):                       # stelle di fondo
        x, y, r = random.uniform(0, S), random.uniform(0, S), random.choice([1, 1, 1.5, 2, 3])
        c = random.randint(150, 255)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(c, c, 255, random.randint(120, 255)))
    cx = cy = S / 2
    R = S * 0.36
    # alone della sfera
    alone = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(alone).ellipse([cx - R - 30, cy - R - 30, cx + R + 30, cy + R + 30], fill=(70, 110, 220, 90))
    cielo.alpha_composite(alone.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(cielo)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(14, 22, 52, 255), outline=(120, 160, 255, 255), width=8)
    # griglia: paralleli (ellissi schiacciate) e meridiani, sfera inclinata
    for lat in (-60, -30, 0, 30, 60):
        y = cy - R * math.sin(math.radians(lat)) * 0.92
        rx = R * math.cos(math.radians(lat))
        ry = rx * 0.28
        d.ellipse([cx - rx, y - ry, cx + rx, y + ry], outline=(80, 110, 190, 255) if lat else (110, 150, 240, 255),
                  width=4 if lat else 6)
    for k in range(6):
        a = math.radians(k * 30)
        rx = abs(R * math.cos(a))
        d.ellipse([cx - rx, cy - R, cx + rx, cy + R], outline=(70, 95, 170, 255), width=4)
    # Via Lattea: banda inclinata luminosa
    banda = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    db = ImageDraw.Draw(banda)
    for i in range(500):
        t = random.uniform(-1, 1)
        x = cx + t * R * 0.95
        y = cy + t * R * 0.55 + random.gauss(0, 22)
        if (x - cx) ** 2 + (y - cy) ** 2 < (R - 10) ** 2:
            r = random.uniform(2, 6)
            db.ellipse([x - r, y - r, x + r, y + r], fill=(200, 190, 255, random.randint(60, 160)))
    cielo.alpha_composite(banda.filter(ImageFilter.GaussianBlur(3)))
    d = ImageDraw.Draw(cielo)
    # la Terra al centro, illuminata da un lato
    rt = R * 0.24
    terra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dt = ImageDraw.Draw(terra)
    dt.ellipse([cx - rt, cy - rt, cx + rt, cy + rt], fill=(30, 90, 170, 255))
    dt.polygon([(cx - rt * 0.7, cy - rt * 0.5), (cx - rt * 0.1, cy - rt * 0.75), (cx + rt * 0.05, cy - rt * 0.2),
                (cx - rt * 0.35, cy + rt * 0.45), (cx - rt * 0.75, cy + rt * 0.1)], fill=(70, 150, 90, 255))
    dt.polygon([(cx + rt * 0.25, cy - rt * 0.55), (cx + rt * 0.8, cy - rt * 0.3), (cx + rt * 0.6, cy + rt * 0.5),
                (cx + rt * 0.3, cy + rt * 0.2)], fill=(70, 150, 90, 255))
    ombra = Image.new("L", (S, S), 0)
    ImageDraw.Draw(ombra).ellipse([cx - rt * 0.55, cy - rt * 1.3, cx + rt * 2.0, cy + rt * 1.3], fill=150)
    ombra = ombra.filter(ImageFilter.GaussianBlur(18))
    buio = Image.new("RGBA", (S, S), (0, 0, 10, 255))
    sfera = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sfera).ellipse([cx - rt, cy - rt, cx + rt, cy + rt], fill=255)
    scura = Image.composite(buio, terra, ombra)
    terra = Image.composite(scura, Image.new("RGBA", (S, S), (0, 0, 0, 0)), sfera)
    cielo.alpha_composite(terra)
    d = ImageDraw.Draw(cielo)
    d.ellipse([cx - rt, cy - rt, cx + rt, cy + rt], outline=(140, 200, 255, 255), width=5)
    # orbita di Fermi (oro)
    d.ellipse([cx - rt * 1.75, cy - rt * 0.55, cx + rt * 1.75, cy + rt * 0.55], outline=(255, 200, 90, 255), width=6)
    d.polygon([(cx + rt * 1.75, cy - 16), (cx + rt * 1.75 + 16, cy), (cx + rt * 1.75, cy + 16), (cx + rt * 1.75 - 16, cy)],
              fill=(255, 215, 110, 255))
    # pulsar in alto a destra con i due fasci (magenta)
    px, py = cx + R * 0.48, cy - R * 0.5
    fasci = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    df = ImageDraw.Draw(fasci)
    ang = math.radians(-35)
    for s in (1, -1):
        lun, larg = R * 0.75, math.radians(11)
        p1 = (px + s * lun * math.cos(ang - larg), py + s * lun * math.sin(ang - larg))
        p2 = (px + s * lun * math.cos(ang + larg), py + s * lun * math.sin(ang + larg))
        df.polygon([(px, py), p1, p2], fill=(255, 95, 210, 150))
    cielo.alpha_composite(fasci.filter(ImageFilter.GaussianBlur(6)))
    bagliore = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bagliore).ellipse([px - 46, py - 46, px + 46, py + 46], fill=(255, 140, 230, 220))
    cielo.alpha_composite(bagliore.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(cielo)
    d.ellipse([px - 17, py - 17, px + 17, py + 17], fill=(255, 245, 255, 255))
    fondo.paste(cielo, (0, 0), maschera)
    return fondo


if __name__ == "__main__":
    web = Path(__file__).resolve().parent / "web"
    web.mkdir(exist_ok=True)
    im = icona()
    im.resize((512, 512), Image.LANCZOS).save(web / "cielo_einstein.png")
    im.resize((256, 256), Image.LANCZOS).save(web / "icona.png")
    im.resize((256, 256), Image.LANCZOS).save(web / "cielo_einstein.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                                                                               (64, 64), (128, 128), (256, 256)])
    print("Icona creata in", web)
