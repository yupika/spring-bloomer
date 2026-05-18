"""Rename PSD source files to match the webp naming convention.

Operates in-place at:
  E:/Project/project/springbloomer/スプリングブルーマー/カード/{手札カード,得点カード}/

Mapping mirrors tools/rename-cards.py.
"""
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

SRC = Path(r'E:/Project/project/springbloomer/スプリングブルーマー/カード')

HAND = {
    'ネジハナ３':  'A3',
    'ネジハナ４':  'A4',
    'ネジハナ６':  'A6',
    'ネジハナ7':   'A7',
    'たんぽぽ２':  'B2',
    'たんぽぽ３':  'B3',
    'たんぽぽ５':  'B5',
    'たんぽぽ６':  'B6',
    'シロツメクサ２': 'C2',
    'シロツメクサ３': 'C3',
    'シロツメクサ４': 'C4',
    'スミレ１':    'D1',
    'スミレ２':    'D2',
    'スミレ３':    'D3',
    'スミレ４':    'D4',
    'オオイヌノフグリ１': 'E1',
    'オオイヌノフグリ２': 'E2',
    'オオイヌノフグリ３': 'E3',
    '特殊-46':     'W-round',
    '特殊-47':     'W-plain',
    '特殊-48 (1)': 'W-draw',
    '裏面':        'back',
}

GOAL = {
    1: 'A12', 2: 'A7',  3: 'A5',  4: 'A4',  5: 'A1',
    6: 'B11', 7: 'B7',  8: 'B6',  9: 'B5', 10: 'B2',
    11: 'C7', 12: 'C6', 13: 'C5', 14: 'C4', 15: 'C3',
    16: 'D9', 17: 'D6', 18: 'D5', 19: 'D4', 20: 'D3',
    21: 'E9', 22: 'E5', 23: 'E4', 24: 'E3', 25: 'E2',
    26: 'back',
}


def find_psd(subdir: Path, stem: str) -> Path | None:
    target = unicodedata.normalize('NFC', stem)
    for p in subdir.iterdir():
        if p.suffix.lower() != '.psd':
            continue
        if unicodedata.normalize('NFC', p.stem) == target:
            return p
    return None


def rename_to(src: Path, new_stem: str) -> None:
    dst = src.with_name(new_stem + '.psd')
    if dst.exists() and dst != src:
        print(f'  SKIP (target exists): {src.name} -> {dst.name}')
        return
    src.rename(dst)
    print(f'  {src.name}  ->  {dst.name}')


def main():
    hand_dir = None
    goal_dir = None
    for d in SRC.iterdir():
        if not d.is_dir():
            continue
        name = unicodedata.normalize('NFC', d.name)
        if '手札' in name: hand_dir = d
        if '得点' in name: goal_dir = d

    if not hand_dir or not goal_dir:
        print('Could not locate 手札/得点 subdirectories')
        return

    print('=== Hand ===')
    for stem, new in HAND.items():
        src = find_psd(hand_dir, stem)
        if src is None:
            print(f'  MISSING: {stem}')
            continue
        rename_to(src, new)

    print('=== Goal ===')
    for n, new in GOAL.items():
        stem = f'カード-{n:02d}'
        src = find_psd(goal_dir, stem)
        if src is None:
            print(f'  MISSING: {stem}')
            continue
        rename_to(src, new)


if __name__ == '__main__':
    main()
