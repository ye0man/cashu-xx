import {
  composeHorizontal,
  cropCenterRatio,
  downscaleNearest,
  readPng,
  shiftDown,
  snapFrame,
  writePng,
} from './image';

const STYLE = {
  tile: 16,
  playerW: 16,
  playerH: 24,
};

function processNpc(input: string, output: string): void {
  const src = readPng(input);
  const cropped = cropCenterRatio(src, STYLE.playerW, STYLE.playerH);
  const frame = downscaleNearest(cropped, STYLE.playerW, STYLE.playerH);
  const report = snapFrame(frame);
  writePng(output, frame);
  process.stdout.write(
    `npc ${output}: ${frame.width}x${frame.height} off-palette ${report.offPixels}/${report.total}\n`,
  );
}

function processTile(input: string, output: string, size = STYLE.tile): void {
  const src = readPng(input);
  const cropped = cropCenterRatio(src, 1, 1);
  const frame = downscaleNearest(cropped, size, size);
  const report = snapFrame(frame);
  writePng(output, frame);
  process.stdout.write(
    `tile ${output}: ${frame.width}x${frame.height} off-palette ${report.offPixels}/${report.total}\n`,
  );
}

function processPlayer(downPath: string, upPath: string, sidePath: string, output: string): void {
  const load = (path: string) => {
    const cropped = cropCenterRatio(readPng(path), STYLE.playerW, STYLE.playerH);
    return downscaleNearest(cropped, STYLE.playerW, STYLE.playerH);
  };
  const down = load(downPath);
  const up = load(upPath);
  const side = load(sidePath);
  snapFrame(down);
  snapFrame(up);
  snapFrame(side);
  const sheet = composeHorizontal([down, up, side, shiftDown(down, 1), shiftDown(up, 1), shiftDown(side, 1)]);
  writePng(output, sheet);
  process.stdout.write(`player ${output}: ${sheet.width}x${sheet.height} (6 frames)\n`);
}

function main(argv: string[]): void {
  const [mode, ...rest] = argv;
  if (mode === 'tile' && rest.length >= 2) {
    processTile(rest[0], rest[1], rest[2] ? Number(rest[2]) : STYLE.tile);
    return;
  }
  if (mode === 'prop' && rest.length >= 2) {
    processTile(rest[0], rest[1], STYLE.tile);
    return;
  }
  if (mode === 'npc' && rest.length >= 2) {
    processNpc(rest[0], rest[1]);
    return;
  }
  if (mode === 'player' && rest.length >= 4) {
    processPlayer(rest[0], rest[1], rest[2], rest[3]);
    return;
  }
  process.stdout.write(
    'usage: sheet-assemble tile <in> <out> [size] | prop <in> <out> | npc <in> <out> | player <down> <up> <side> <out>\n',
  );
  process.exit(1);
}

main(process.argv.slice(2));
