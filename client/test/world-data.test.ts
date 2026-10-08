import { describe, expect, it } from 'vitest';
import { MILESTONE_IDS } from '@cashu-xx/shared';
import { MAPS, doorAt, isWalkable, type MapDef } from '../src/data/maps';
import { NPCS } from '../src/data/npcs';
import { SIGNS, SIGN_TOTAL } from '../src/data/signs';

const allMaps = (): MapDef[] => Object.values(MAPS);

describe('world data integrity', () => {
  it('has nine maps including the overworld', () => {
    expect(Object.keys(MAPS)).toHaveLength(9);
    expect(MAPS.nutsterdam.outdoor).toBe(true);
  });

  it('every door lands on a walkable, non-door tile of an existing map', () => {
    for (const map of allMaps()) {
      for (const door of map.doors) {
        const target = MAPS[door.targetMap];
        expect(target, `${map.id} door targets unknown map ${door.targetMap}`).toBeDefined();
        expect(
          isWalkable(target, door.targetX, door.targetY),
          `${map.id} door target ${door.targetMap}(${door.targetX},${door.targetY}) is blocked`,
        ).toBe(true);
        expect(
          doorAt(target, door.targetX, door.targetY),
          `${map.id} door target lands on another door`,
        ).toBeNull();
      }
    }
  });

  it('every map spawn is walkable and not on a door', () => {
    for (const map of allMaps()) {
      expect(isWalkable(map, map.spawn.x, map.spawn.y), `${map.id} spawn is blocked`).toBe(true);
      expect(doorAt(map, map.spawn.x, map.spawn.y), `${map.id} spawn sits on a door`).toBeNull();
    }
  });

  it('every sign spot maps to real dialogue and each sign is placed once', () => {
    const placed: string[] = [];
    for (const map of allMaps()) {
      for (const spot of map.signs) {
        expect(SIGNS[spot.signId], `${map.id} references missing ${spot.signId}`).toBeDefined();
        placed.push(spot.signId);
      }
    }
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(Object.keys(SIGNS).sort());
  });

  it('has at least thirty signs and every sign has lines', () => {
    expect(SIGN_TOTAL).toBeGreaterThanOrEqual(30);
    for (const [id, script] of Object.entries(SIGNS)) {
      expect(script.lines.length, `${id} has no lines`).toBeGreaterThan(0);
    }
  });

  it('the Numo POS terminal line is verbatim', () => {
    expect(SIGNS['sign-pos'].lines).toEqual([
      "It's a Numo POS terminal. You tapped and paid for your espresso with ecash!",
    ]);
  });

  it('door approach tiles on the overworld are walkable', () => {
    const overworld = MAPS.nutsterdam;
    const exits = allMaps()
      .filter((map) => map.id !== 'nutsterdam')
      .map((map) => map.doors[0]);
    for (const door of exits) {
      expect(
        isWalkable(overworld, door.targetX, door.targetY),
        `exit to ${door.targetX},${door.targetY} is blocked`,
      ).toBe(true);
    }
  });

  it('every npc is defined and placed on their home map', () => {
    for (const map of allMaps()) {
      for (const spot of map.npcs) {
        const def = NPCS[spot.npcId];
        expect(def, `${map.id} references missing npc ${spot.npcId}`).toBeDefined();
        expect(def.mapId).toBe(map.id);
      }
    }
    expect(Object.keys(NPCS).length).toBeGreaterThanOrEqual(7);
  });

  it('every pickup has a valid flag and milestone id', () => {
    const milestones: string[] = [...MILESTONE_IDS];
    for (const map of allMaps()) {
      for (const spot of map.pickups) {
        expect(spot.flag.length).toBeGreaterThan(0);
        if (spot.milestoneId) {
          expect(milestones).toContain(spot.milestoneId);
        }
      }
    }
  });

  it('every door and sign approach is reachable from spawn (flood fill)', () => {
    for (const map of allMaps()) {
      const seen = new Set<string>();
      const queue: Array<[number, number]> = [[map.spawn.x, map.spawn.y]];
      while (queue.length > 0) {
        const [x, y] = queue.shift() as [number, number];
        const key = `${x},${y}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (isWalkable(map, nx, ny) && !seen.has(`${nx},${ny}`)) {
            queue.push([nx, ny]);
          }
        }
      }
      for (const door of map.doors) {
        expect(seen.has(`${door.x},${door.y}`), `${map.id} door (${door.x},${door.y}) unreachable`).toBe(true);
      }
      for (const spot of map.signs) {
        const [sx, sy] = approachTile(map, spot.x, spot.y);
        expect(
          seen.has(`${sx},${sy}`),
          `${map.id} sign ${spot.signId} has no reachable approach tile`,
        ).toBe(true);
      }
      for (const spot of map.npcs) {
        const [nx, ny] = approachTile(map, spot.x, spot.y);
        expect(
          seen.has(`${nx},${ny}`),
          `${map.id} npc ${spot.npcId} has no reachable approach tile`,
        ).toBe(true);
      }
      for (const spot of map.pickups) {
        const [px, py] = approachTile(map, spot.x, spot.y);
        expect(
          seen.has(`${px},${py}`),
          `${map.id} pickup ${spot.id} has no reachable approach tile`,
        ).toBe(true);
      }
    }
  });
});

function approachTile(map: MapDef, x: number, y: number): [number, number] {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    if (isWalkable(map, x + dx, y + dy)) {
      return [x + dx, y + dy];
    }
  }
  return [-1, -1];
}
