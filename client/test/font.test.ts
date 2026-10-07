import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_CHARS, FONT_COLUMNS, fontAtlas, GLYPH_H, GLYPH_W, validateFont } from '../src/art/font';
import { SIGNS } from '../src/data/signs';
import { disc } from '../src/art/textures';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** String literals (quotes and templates) from the client source, minus comments. */
function literalChars(): Set<string> {
  const chars = new Set<string>();
  for (const file of sourceFiles(srcDir)) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const match of code.matchAll(/'([^'\\\n]|\\.)*'|`[^`]*`/g)) {
      for (const ch of match[0].slice(1, -1)) {
        chars.add(ch);
      }
    }
  }
  return chars;
}

describe('pixel font', () => {
  it('has well-formed glyphs', () => {
    expect(() => validateFont()).not.toThrow();
  });

  it('bakes every glyph into one atlas grid', () => {
    const atlas = fontAtlas(0xffffff);
    expect(atlas.width).toBe(FONT_COLUMNS * GLYPH_W);
    expect(atlas.height).toBe(Math.ceil([...FONT_CHARS].length / FONT_COLUMNS) * GLYPH_H);
  });

  it('covers every character the game prints (dialogue, signs, UI)', () => {
    const covered = new Set([...FONT_CHARS, '\n']);
    const used = literalChars();
    for (const script of Object.values(SIGNS)) {
      for (const line of [...script.lines, script.speaker ?? '']) {
        for (const ch of line) {
          used.add(ch);
        }
      }
    }
    // Template interpolation syntax and escapes are not printed glyphs.
    const missing = [...used].filter((ch) => !covered.has(ch) && ch !== '\\' && ch.charCodeAt(0) >= 32);
    expect(missing).toEqual([]);
  });

  it('draws the title disc as a symmetric pixel circle', () => {
    const field = disc(52, 0x7f38ca);
    expect(field.width).toBe(105);
    expect(field.get(52, 0)).not.toBeNull();
    expect(field.get(0, 0)).toBeNull();
    expect(field.get(104, 52)).not.toBeNull();
  });
});
