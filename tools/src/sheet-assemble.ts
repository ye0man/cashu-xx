export function assembleSheet(_framesDir: string): never {
  throw new Error('sheet-assemble lands in P4 (docs/ROADMAP.md)');
}

if (process.argv[1]?.endsWith('sheet-assemble.ts')) {
  process.stdout.write('sheet-assemble: not implemented yet — lands in P4 (docs/ROADMAP.md)\n');
}
