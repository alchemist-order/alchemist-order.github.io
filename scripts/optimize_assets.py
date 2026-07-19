from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'


def save_png8(img: Image.Image, path: Path) -> bool:
    before = path.stat().st_size if path.exists() else 0
    if img.mode not in ('RGBA', 'LA'):
        img = img.convert('RGBA')
    q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    q.save(path, optimize=True)
    return path.stat().st_size <= before or before == 0


def fit(img: Image.Image, max_side: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)


def optimize_sprites() -> None:
    for path in sorted((PUBLIC / 'sprites').glob('*.png')):
        with Image.open(path) as im:
            img = fit(im.convert('RGBA'), 256)
            save_png8(img, path)


def optimize_ui() -> None:
    for path in sorted((PUBLIC / 'ui').glob('*.png')):
        max_side = 512 if path.name == 'logo.png' else 256
        with Image.open(path) as im:
            img = fit(im.convert('RGBA'), max_side)
            save_png8(img, path)



def optimize_portraits() -> None:
    portrait_dir = PUBLIC / 'portraits'
    if not portrait_dir.exists():
        return
    for path in sorted(portrait_dir.glob('*.png')):
        with Image.open(path) as im:
            img = fit(im.convert('RGBA'), 768)
            save_png8(img, path)

def optimize_map_webp() -> None:
    for path in sorted((PUBLIC / 'bg' / 'map').glob('*.png')):
        out = path.with_suffix('.webp')
        with Image.open(path) as im:
            im.convert('RGB').save(out, 'WEBP', quality=78, method=6)
        path.unlink()


def optimize_jpegs() -> None:
    targets = list((PUBLIC / 'bg' / 'battle').glob('*.jpg'))
    title = PUBLIC / 'bg' / 'title.jpg'
    if title.exists():
        targets.append(title)
    for path in targets:
        with Image.open(path) as im:
            im.convert('RGB').save(path, 'JPEG', quality=72, optimize=True, progressive=True)


def main() -> None:
    optimize_sprites()
    optimize_ui()
    optimize_portraits()
    optimize_map_webp()
    optimize_jpegs()
    print('optimize_assets: done')


if __name__ == '__main__':
    main()
