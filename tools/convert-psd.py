"""Convert PSD card files to webp.

Reads from:  E:/Project/project/springbloomer/スプリングブルーマー/カード/{手札カード,得点カード}/
Writes to:   E:/Project/personalwork/spring-bloomer/assets/cards/{hand,goal}/

PSD filenames already use the semantic naming convention (A3.psd, B11.psd, ...).
The webp output keeps the same stem.

NOTE: source dirnames are NFD (macOS) normalized, so we iterate over iterdir()
rather than constructing paths from string literals.
"""
import sys
import unicodedata
from pathlib import Path
from psd_tools import PSDImage

sys.stdout.reconfigure(encoding='utf-8')

SRC = Path(r'E:/Project/project/springbloomer/スプリングブルーマー/カード')
DST = Path(r'E:/Project/personalwork/spring-bloomer/assets/cards')


def convert(psd_path: Path, out_path: Path) -> None:
    try:
        psd = PSDImage.open(psd_path)
        img = psd.composite()
    except Exception as e:
        print(f'  ERROR {psd_path.name}: {e}')
        return
    if img is None:
        print(f'  SKIP (no composite): {psd_path.name}')
        return
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    img.save(out_path, format='WEBP', quality=92, method=6)
    print(f'  {psd_path.stem}.webp  ({img.size[0]}x{img.size[1]})')


def main():
    for subdir in sorted(SRC.iterdir()):
        if not subdir.is_dir():
            continue
        name = unicodedata.normalize('NFC', subdir.name)
        if '手札' in name:
            out_dir = DST / 'hand'
        elif '得点' in name:
            out_dir = DST / 'goal'
        else:
            print(f'SKIP unknown subdir: {name}')
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f'=== {name} ===')
        for psd in sorted(subdir.glob('*.psd')):
            stem = unicodedata.normalize('NFC', psd.stem)
            convert(psd, out_dir / (stem + '.webp'))


if __name__ == '__main__':
    main()
