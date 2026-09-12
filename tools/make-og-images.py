#!/usr/bin/env python3
"""Build Open Graph preview cards (1200x630) for wcahs.org.

Every page used to point og:image at images/logo.png — 250x90, well under
Facebook's 200x200 floor — so the scraper upscaled and cropped it into an
unreadable smear. These are purpose-built at the size social platforms
actually want, using the site's own fonts and palette.

Fonts are fetched from Google Fonts into tools/fonts/ (gitignored); run
tools/fetch-og-fonts.sh first if they're missing.

    python3 tools/make-og-images.py
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'tools', 'fonts')
OUT = os.path.join(ROOT, 'images', 'og')

W, H = 1200, 630
SAGE_DARK = (59, 68, 52)
SAGE_MID = (92, 107, 78)
SAGE_LIGHT = (210, 216, 200)
AMBER = (245, 158, 11)
CREAM = (253, 248, 243)


def font(name, size):
    path = os.path.join(FONTS, name)
    if not os.path.exists(path):
        sys.exit(f"Missing font {path}\nRun: bash tools/fetch-og-fonts.sh")
    return ImageFont.truetype(path, size)


def gradient(w, h, top, bottom):
    """Vertical-ish diagonal wash, so the card isn't a flat block of colour."""
    base = Image.new('RGB', (w, h), top)
    grad = Image.new('L', (w, h))
    px = grad.load()
    for y in range(h):
        for x in range(0, w, 4):
            v = int(255 * ((x / w) * 0.35 + (y / h) * 0.65))
            for dx in range(4):
                if x + dx < w:
                    px[x + dx, y] = v
    return Image.composite(Image.new('RGB', (w, h), bottom), base, grad)


def tint(path, colour, height):
    """Recolour the black logo artwork to a flat colour, keeping its alpha."""
    art = Image.open(path).convert('RGBA')
    ratio = height / art.height
    art = art.resize((int(art.width * ratio), height), Image.LANCZOS)
    solid = Image.new('RGBA', art.size, colour + (255,))
    solid.putalpha(art.getchannel('A'))
    return solid


def photo_panel(path, w, h):
    """Cover-crop a photo to fill a panel."""
    im = Image.open(path).convert('RGB')
    scale = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1), Image.LANCZOS)
    left = (im.width - w) // 2
    top = int((im.height - h) * 0.35)   # bias upward — faces sit high in these
    return im.crop((left, top, left + w, top + h))


def fade_left(panel, width):
    """Feather a panel's left edge so it melts into the background."""
    mask = Image.new('L', panel.size, 255)
    px = mask.load()
    for x in range(width):
        v = int(255 * (x / width) ** 1.4)
        for y in range(panel.height):
            px[x, y] = v
    return mask


def wrap(draw, text, fnt, max_w):
    words, lines, line = text.split(), [], ''
    for word in words:
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def card(headline, lines, url, photo, out_name, headline_size=76):
    img = gradient(W, H, SAGE_DARK, SAGE_MID)

    # Photo occupies the right third, faded into the background.
    pw = 470
    panel = photo_panel(photo, pw, H)
    img.paste(panel, (W - pw, 0), fade_left(panel, 240))

    # Darken behind the text so it stays readable whatever the photo does.
    veil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(veil).rectangle([0, 0, 780, H], fill=(35, 42, 31, 120))
    img = Image.alpha_composite(img.convert('RGBA'), veil.filter(ImageFilter.GaussianBlur(60))).convert('RGB')

    d = ImageDraw.Draw(img)
    logo = tint(os.path.join(ROOT, 'images', 'logo.png'), (255, 255, 255), 58)
    img.paste(logo, (64, 56), logo)

    y = 168
    for line in wrap(d, headline, font('Playfair-Bold.ttf', headline_size), 660):
        d.text((64, y), line, font=font('Playfair-Bold.ttf', headline_size), fill=(255, 255, 255))
        y += int(headline_size * 1.12)

    y += 14
    for text, size, colour in lines:
        for line in wrap(d, text, font('Nunito-Bold.ttf', size), 660):
            d.text((64, y), line, font=font('Nunito-Bold.ttf', size), fill=colour)
            y += int(size * 1.38)
        y += 8

    if url:
        f = font('Nunito-XBold.ttf', 30)
        tw = d.textlength(url, font=f)
        d.rounded_rectangle([64, H - 108, 64 + tw + 56, H - 44], radius=32, fill=AMBER)
        d.text((92, H - 95), url, font=f, fill=(61, 43, 6))

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out_name)
    img.save(path, 'PNG', optimize=True)
    print(f'  {out_name}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path)//1024}KB')


if __name__ == '__main__':
    print('Building Open Graph cards:')

    card(
        'Spay & Neuter Clinic',
        [('Sunday, October 4  ·  Waterville, MN', 34, (255, 255, 255)),
         ('For households with multiple cats & dogs', 27, SAGE_LIGHT)],
        'wcahs.org/snap',
        os.path.join(ROOT, 'images', 'photos', 'IMG_1595.JPEG'),
        'clinic.png',
    )

    card(
        'Waseca County Animal Humane Society',
        [('A No-Kill 501(c)(3) shelter serving southern Minnesota', 28, SAGE_LIGHT)],
        'wcahs.org',
        os.path.join(ROOT, 'images', 'photos', 'IMG_1598.JPEG'),
        'default.png',
        headline_size=62,
    )

    card(
        'Adoptable Pets',
        [('Meet the cats and dogs looking for homes', 30, (255, 255, 255)),
         ('Waseca County Animal Humane Society', 26, SAGE_LIGHT)],
        'wcahs.org/pets',
        os.path.join(ROOT, 'images', 'photos', 'IMG_1596.JPEG'),
        'pets.png',
    )
