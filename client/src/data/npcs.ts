import type { DialogueScript } from '../systems/dialogue';

export interface NpcDef {
  id: string;
  name: string;
  mapId: string;
  texture: string;
  flavor?: DialogueScript;
}

export const NPCS: Record<string, NpcDef> = {
  hickory: { id: 'hickory', name: 'PROF. HICKORY', mapId: 'lab', texture: 'npc-hickory' },
  rusty: { id: 'rusty', name: 'RUSTY', mapId: 'rusty-workshop', texture: 'npc-rusty' },
  coco: { id: 'coco', name: 'COCO', mapId: 'palm-house', texture: 'npc-coco' },
  pip: { id: 'pip', name: 'PIP', mapId: 'library', texture: 'npc-pip' },
  djmac: { id: 'djmac', name: 'DJ MAC', mapId: 'club', texture: 'npc-djmac' },
  kimi: { id: 'kimi', name: 'KIMI', mapId: 'hideout', texture: 'npc-kimi' },
  receptionist: {
    id: 'receptionist',
    name: 'RECEPTIONIST',
    mapId: 'minibits-hq',
    texture: 'npc-receptionist',
  },
  'civ-doner': {
    id: 'civ-doner',
    name: 'DÖNER DAN',
    mapId: 'nussstadt',
    texture: 'npc-civ-a',
    flavor: {
      speaker: 'DÖNER DAN',
      lines: [
        'Döner sats aren’t a real unit. The döner is real though. That’s what matters.',
        'You look like a spec change. Extra garlic?',
      ],
    },
  },
  'civ-commuter': {
    id: 'civ-commuter',
    name: 'COMMUTER',
    mapId: 'nussstadt',
    texture: 'npc-civ-b',
    flavor: {
      speaker: 'COMMUTER',
      lines: [
        'The red line never reopened. Kimi likes it that way, if you believe the posters.',
        'I paid for my coffee with ecash this morning. The future is moderately convenient.',
      ],
    },
  },
};
