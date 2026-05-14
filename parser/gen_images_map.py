#!/usr/bin/env python3
"""Generate src/assets/questions/imagesMap.ts from bundled images."""
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
IMAGES_DIR = os.path.join(ROOT_DIR, 'src', 'assets', 'questions', 'images')
OUT_FILE   = os.path.join(ROOT_DIR, 'src', 'assets', 'questions', 'imagesMap.ts')

images = sorted(f for f in os.listdir(IMAGES_DIR) if f.endswith('.png'))

lines = [
    '// Auto-generated — do not edit by hand.',
    '// Re-run parser/gen_images_map.py to refresh after adding new images.',
    '// eslint-disable @typescript-eslint/no-require-imports',
    'const imagesMap: Record<string, number> = {',
]
for img in images:
    lines.append(f"  '{img}': require('./images/{img}'),")
lines += [
    '};',
    '// eslint-enable @typescript-eslint/no-require-imports',
    '',
    'export function getQuestionImage(',
    '  filename: string | null | undefined,',
    '): number | undefined {',
    '  if (!filename) return undefined;',
    '  return imagesMap[filename];',
    '}',
]

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f'Generated {OUT_FILE} with {len(images)} entries')
