"""Convert all PSD card files to webp.

Reads from:  E:/Project/project/springbloomer/スプリングブルーマー/カード/
Writes to:   E:/Project/personalwork/spring-bloomer/assets/cards/raw/

NOTE: source filenames use NFD (macOS) normalization, so we iterate over
iterdir() rather than constructing paths from string literals.
"""
import sys
import unicodedata
from pathlib import Path
from psd_tools import PSDImage

sys.stdout.reconfigure(encoding='utf-8')

SRC = Path(r'E:/Project/project/springbloomer/スプリングブルーマー/カード')
DST = Path(r'E:/Project/personalwork/spring-bloomer/assets/cards/raw')

DST.mkdir(parents=True, exist_ok=True)
(DST / 'hand').mkdir(exist_ok=True)
(DST / 'goal').mkdir(exist_ok=True)


def safe_stem(name: str) -> str:
    """Normalize NFD -> NFC so Windows handles the file properly."""
    return unicodedata.normalize('NFC', name)


def convert(psd_path: Path, out_path: Path) -> None:
    try:
        psd = PSDImage.open(psd_path)
        img = psd.composite()
    except Exception as e:
        print(f'  ERROR opening {psd_path.name}: {e}')
        return
    if img is None:
        print(f'  SKIP (no composite): {psd_path.name}')
        return
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    img.save(out_path, format='WEBP', quality=92, method=6)
    print(f'  {safe_stem(psd_path.stem)}.webp  ({img.size[0]}x{img.size[1]})')


def main():
    for subdir in sorted(SRC.iterdir()):
        if not subdir.is_dir():
            continue
        name = safe_stem(subdir.name)
        if '手札' in name:
            out_dir = DST / 'hand'
        elif '得点' in name:
            out_dir = DST / 'goal'
        else:
            print(f'SKIP unknown subdir: {name}')
            continue
        print(f'=== {name} ===')
        psds = sorted(subdir.glob('*.psd'))
        for psd in psds:
            stem = safe_stem(psd.stem)
            convert(psd, out_dir / (stem + '.webp'))


if __name__ == '__main__':
    main()
