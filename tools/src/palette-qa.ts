export function qaSpriteSheet(_sheetPath: string): never {
  throw new Error('palette-qa lands in P4 (docs/ROADMAP.md)');
}

if (process.argv[1]?.endsWith('palette-qa.ts')) {
  process.stdout.write('palette-qa: not implemented yet — lands in P4 (docs/ROADMAP.md)\n');
}
