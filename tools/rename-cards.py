"""Copy raw webp cards to semantic filenames under assets/cards/{hand,goal}/.

Mapping is fixed based on user confirmation. Keeps raw/ originals intact.
"""
import sys
import shutil
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(r'E:/Project/personalwork/spring-bloomer/assets/cards')
RAW = ROOT / 'raw'
HAND_OUT = ROOT / 'hand'
GOAL_OUT = ROOT / 'goal'
HAND_OUT.mkdir(parents=True, exist_ok=True)
GOAL_OUT.mkdir(parents=True, exist_ok=True)

# Hand card mapping: source filename (NFC) -> destination filename
HAND = {
    # ネジハナ A
    'ネジハナ３':  'A3.webp',
    'ネジハナ４':  'A4.webp',
    'ネジハナ６':  'A6.webp',
    'ネジハナ7':   'A7.webp',
    # たんぽぽ B
    'たんぽぽ２':  'B2.webp',
    'たんぽぽ３':  'B3.webp',
    'たんぽぽ５':  'B5.webp',
    'たんぽぽ６':  'B6.webp',
    # シロツメクサ C
    'シロツメクサ２': 'C2.webp',
    'シロツメクサ３': 'C3.webp',
    'シロツメクサ４': 'C4.webp',
    # スミレ D
    'スミレ１':    'D1.webp',
    'スミレ２':    'D2.webp',
    'スミレ３':    'D3.webp',
    'スミレ４':    'D4.webp',
    # オオイヌノフグリ E
    'オオイヌノフグリ１': 'E1.webp',
    'オオイヌノフグリ２': 'E2.webp',
    'オオイヌノフグリ３': 'E3.webp',
    # Wild W
    '特殊-46':     'W-round.webp',
    '特殊-47':     'W-plain.webp',
    '特殊-48 (1)': 'W-draw.webp',
    # Back
    '裏面':        'back.webp',
}

# Goal card mapping: card-01 ~ card-26 -> suit+value
GOAL = {
    1:  'A12.webp',  2:  'A7.webp',   3:  'A5.webp',   4:  'A4.webp',   5:  'A1.webp',
    6:  'B11.webp',  7:  'B7.webp',   8:  'B6.webp',   9:  'B5.webp',  10:  'B2.webp',
    11: 'C7.webp',  12: 'C6.webp',  13: 'C5.webp',  14: 'C4.webp',  15: 'C3.webp',
    16: 'D9.webp',  17: 'D6.webp',  18: 'D5.webp',  19: 'D4.webp',  20: 'D3.webp',
    21: 'E9.webp',  22: 'E5.webp',  23: 'E4.webp',  24: 'E3.webp',  25: 'E2.webp',
    26: 'back.webp',
}


def find_raw(subdir: str, stem: str) -> Path | None:
    """Find a raw file matching `stem` in NFC form regardless of FS normalization."""
    src_dir = RAW / subdir
    target = unicodedata.normalize('NFC', stem)
    for p in src_dir.iterdir():
        if unicodedata.normalize('NFC', p.stem) == target:
            return p
    return None


def main():
    print('=== Hand ===')
    for stem, out_name in HAND.items():
        src = find_raw('hand', stem)
        if src is None:
            print(f'  MISSING: {stem}')
            continue
        dst = HAND_OUT / out_name
        shutil.copyfile(src, dst)
        print(f'  {stem}  ->  {out_name}')

    print('=== Goal ===')
    for n, out_name in GOAL.items():
        stem = f'カード-{n:02d}'
        src = find_raw('goal', stem)
        if src is None:
            print(f'  MISSING: {stem}')
            continue
        dst = GOAL_OUT / out_name
        shutil.copyfile(src, dst)
        print(f'  {stem}  ->  {out_name}')


if __name__ == '__main__':
    main()
