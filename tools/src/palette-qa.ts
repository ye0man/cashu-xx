import { paletteCoverage, readPng } from './image';

function main(argv: string[]): void {
  const tolerance = Number(process.env.PALETTE_TOLERANCE ?? '0.10');
  const files = argv.filter((arg) => !arg.startsWith('--'));
  if (files.length === 0) {
    process.stdout.write('usage: palette-qa <png> [png...]\n');
    process.exit(1);
  }
  let failed = false;
  for (const file of files) {
    const png = readPng(file);
    const { onPalette, total } = paletteCoverage(png);
    const ratio = onPalette / total;
    const status = ratio >= 1 - tolerance ? 'ok' : 'FAIL';
    if (status === 'FAIL') {
      failed = true;
    }
    process.stdout.write(
      `${status} ${file}: ${(ratio * 100).toFixed(1)}% on-palette (${onPalette}/${total})\n`,
    );
  }
  process.exit(failed ? 1 : 0);
}

main(process.argv.slice(2));
