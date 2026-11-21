"""Generates the Family Notes application icon and writes it where the builds pick it up.

The icon is a white note sheet with a folded corner, a blue title line, grey text lines and a
red heart, on the application's blue (#007AFF). It is drawn with Pillow at SUPERSAMPLING times
the target size, then downscaled, so that every density stays sharp without an SVG renderer.

Outputs, relative to the repository root:

- ``frontend/android/app/src/main/res/mipmap-<density>/ic_launcher.png``: legacy square icon
  (Android 7 and below), rounded corners;
- ``.../mipmap-<density>/ic_launcher_round.png``: legacy round icon;
- ``.../mipmap-<density>/ic_launcher_foreground.png``: foreground layer of the adaptive icon
  (Android 8+), on a transparent 108 dp canvas whose drawing stays inside the 66 dp safe zone;
- ``.../values/ic_launcher_background.xml``: background colour of the adaptive icon;
- ``frontend/public/favicon.ico``: icon of the web version (GitHub Pages).

Run from the repository root (requires Pillow): ``python3 scripts/app_icon/generate_app_icon.py``.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT: Path = Path(__file__).resolve().parents[2]
ANDROID_RES: Path = REPO_ROOT / 'frontend/android/app/src/main/res'
FAVICON: Path = REPO_ROOT / 'frontend/public/favicon.ico'

SUPERSAMPLING: int = 4

BACKGROUND_HEX: str = '#007AFF'
BACKGROUND: tuple = (0, 122, 255, 255)
SHEET: tuple = (255, 255, 255, 255)
FOLD: tuple = (205, 222, 245, 255)
TITLE_LINE: tuple = (0, 122, 255, 255)
TEXT_LINE: tuple = (199, 210, 226, 255)
HEART: tuple = (255, 59, 48, 255)
SHADOW: tuple = (0, 40, 110, 90)

LEGACY_SIZES: dict = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
"""Legacy icon side in pixels per density (48 dp)."""

ADAPTIVE_SCALE: float = 108 / 72
"""Ratio between the adaptive canvas (108 dp) and the visible legacy icon (72 dp of it)."""

FAVICON_SIZES: list = [(16, 16), (32, 32), (48, 48)]


def draw_sheet_shadow(side: float, box: tuple, radius: float) -> Image.Image:
    """Soft shadow cast below the sheet, so that it stands out from the background."""
    x0, y0, x1, y1 = box
    drop: float = 0.02 * side
    layer: Image.Image = Image.new('RGBA', (int(side), int(side)), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + drop, x1, y1 + drop), radius, fill=SHADOW)
    return layer.filter(ImageFilter.GaussianBlur(0.02 * side))


def draw_sheet(side: float, box: tuple, radius: float, fold: float) -> Image.Image:
    """White sheet whose top-right corner is cut away and replaced by a folded triangle."""
    x0, y0, x1, y1 = box
    layer: Image.Image = Image.new('RGBA', (int(side), int(side)), (0, 0, 0, 0))
    draw: ImageDraw.ImageDraw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(box, radius, fill=SHEET)
    draw.polygon([(x1 - fold, y0 - 1), (x1 + 1, y0 - 1), (x1 + 1, y0 + fold)], fill=(0, 0, 0, 0))
    draw.polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=FOLD)
    return layer


def draw_text_lines(draw: ImageDraw.ImageDraw, side: float, box: tuple, fold: float) -> None:
    """Title line in blue, then three grey text lines kept clear of the heart."""
    x0, y0, x1, _ = box
    left: float = x0 + 0.065 * side
    thickness: float = 0.032 * side
    lines: list = [
        (y0 + 0.10 * side, x1 - fold - 0.04 * side, TITLE_LINE),
        (y0 + 0.19 * side, x1 - 0.065 * side, TEXT_LINE),
        (y0 + 0.265 * side, x1 - 0.20 * side, TEXT_LINE),
        (y0 + 0.34 * side, x0 + 0.17 * side, TEXT_LINE),
    ]
    for centre_y, right, colour in lines:
        top: float = centre_y - thickness / 2
        bottom: float = centre_y + thickness / 2
        draw.rounded_rectangle((left, top, right, bottom), thickness / 2, fill=colour)


def draw_heart(draw: ImageDraw.ImageDraw, side: float, box: tuple) -> None:
    """Heart in the bottom-right corner of the sheet: two circles over a downward triangle."""
    _, _, x1, y1 = box
    size: float = 0.115 * side
    left: float = x1 - 0.06 * side - size
    top: float = y1 - 0.05 * side - size
    lobe: float = size * 0.27
    draw.ellipse((left, top, left + 2 * lobe, top + 2 * lobe), fill=HEART)
    draw.ellipse((left + size - 2 * lobe, top, left + size, top + 2 * lobe), fill=HEART)
    draw.polygon(
        [
            (left + 0.02 * size, top + lobe * 1.25),
            (left + size - 0.02 * size, top + lobe * 1.25),
            (left + size / 2, top + size * 0.92),
        ],
        fill=HEART,
    )


def render_foreground(size: int) -> Image.Image:
    """Adaptive-icon foreground: the sheet on a transparent square of the given side.

    The sheet's half-diagonal stays under 0.305 of the side, i.e. inside the 66 dp safe circle
    of the 108 dp canvas, so that no launcher mask crops it.
    """
    side: float = size * SUPERSAMPLING
    width: float = 0.38 * side
    height: float = 0.46 * side
    x0: float = (side - width) / 2
    y0: float = (side - height) / 2
    box: tuple = (x0, y0, x0 + width, y0 + height)
    radius: float = 0.045 * side
    fold: float = 0.11 * side

    canvas: Image.Image = Image.new('RGBA', (int(side), int(side)), (0, 0, 0, 0))
    canvas = Image.alpha_composite(canvas, draw_sheet_shadow(side, box, radius))
    canvas = Image.alpha_composite(canvas, draw_sheet(side, box, radius, fold))
    draw: ImageDraw.ImageDraw = ImageDraw.Draw(canvas)
    draw_text_lines(draw, side, box, fold)
    draw_heart(draw, side, box)
    return canvas.resize((size, size), Image.LANCZOS)


def render_legacy(size: int, round_shape: bool) -> Image.Image:
    """Legacy icon: the visible 72 dp centre of the adaptive icon, masked to a shape.

    Cropping the adaptive composition keeps the legacy and adaptive icons identical.
    """
    canvas_size: int = round(size * ADAPTIVE_SCALE)
    background: Image.Image = Image.new('RGBA', (canvas_size, canvas_size), BACKGROUND)
    composition: Image.Image = Image.alpha_composite(background, render_foreground(canvas_size))
    offset: int = (canvas_size - size) // 2
    visible: Image.Image = composition.crop((offset, offset, offset + size, offset + size))

    mask_side: int = size * SUPERSAMPLING
    mask: Image.Image = Image.new('L', (mask_side, mask_side), 0)
    mask_draw: ImageDraw.ImageDraw = ImageDraw.Draw(mask)
    bounds: tuple = (0, 0, mask_side - 1, mask_side - 1)
    if round_shape:
        mask_draw.ellipse(bounds, fill=255)
    else:
        mask_draw.rounded_rectangle(bounds, 0.22 * mask_side, fill=255)
    small_mask: Image.Image = mask.resize((size, size), Image.LANCZOS)

    icon: Image.Image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    icon.paste(visible, (0, 0), small_mask)
    return icon


def write_android_icons() -> None:
    """Writes the three launcher PNGs of every density into the mipmap folders."""
    for density, size in LEGACY_SIZES.items():
        folder: Path = ANDROID_RES / f'mipmap-{density}'
        folder.mkdir(parents=True, exist_ok=True)
        foreground_size: int = round(size * 108 / 48)
        render_legacy(size, round_shape=False).save(folder / 'ic_launcher.png')
        render_legacy(size, round_shape=True).save(folder / 'ic_launcher_round.png')
        render_foreground(foreground_size).save(folder / 'ic_launcher_foreground.png')


def write_adaptive_background() -> None:
    """Writes the background colour that mipmap-anydpi-v26/ic_launcher*.xml reference."""
    xml: str = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">{BACKGROUND_HEX}</color>\n'
        '</resources>\n'
    )
    (ANDROID_RES / 'values/ic_launcher_background.xml').write_text(xml)


def write_favicon() -> None:
    """Writes the multi-size favicon referenced by frontend/src/index.html."""
    largest: int = FAVICON_SIZES[-1][0]
    render_legacy(largest, round_shape=False).save(FAVICON, sizes=FAVICON_SIZES)


if __name__ == '__main__':
    write_android_icons()
    write_adaptive_background()
    write_favicon()
    print(f'Icons written under {ANDROID_RES} and {FAVICON}')
