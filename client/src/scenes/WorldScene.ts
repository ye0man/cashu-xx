import * as Phaser from 'phaser';
import { mapTextureKey } from '../art/textures';
import { GAME_CONFIG } from '../data/config';
import {
  type DoorDef,
  type MapDef,
  MAPS,
  doorAt,
  isWalkable,
  npcAt,
  pickupAt,
  signAt,
} from '../data/maps';
import { NPCS } from '../data/npcs';
import { SIGNS } from '../data/signs';
import { audio, type ThemeKey } from '../systems/audio';
import { NightOverlay } from '../systems/lighting';
import { type Direction, DELTAS, GridMover } from '../systems/movement';
import { hasFlag } from '../systems/quests';
import { worldState } from '../systems/save';
import { type StoryContext, talkTo, touchPickup } from '../systems/story';
import { DialogManager } from '../ui/DialogManager';
import { MenuManager } from '../ui/MenuManager';
import { PixelLabel } from '../ui/text';
import { TokenBank } from '../ui/TokenBank';

interface WorldEntry {
  mapId?: string;
  tileX?: number;
  tileY?: number;
  facing?: Direction;
}

const MAP_THEMES: Record<string, ThemeKey> = {
  nussstadt: 'overworld',
  lab: 'lab',
  cafe: 'overworld',
  'minibits-hq': 'hq',
  'rusty-workshop': 'overworld',
  'palm-house': 'overworld',
  library: 'overworld',
  club: 'club',
  hideout: 'hideout',
};

const FACING_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

/** stand → stepA → stand → stepB, one phase per quarter tile of travel time */
const WALK_CYCLE = [0, 1, 0, 2];
const WALK_PHASE_MS = 120;

export class WorldScene extends Phaser.Scene {
  private mapDef!: MapDef;
  private mover!: GridMover;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionKeys!: Phaser.Input.Keyboard.Key[];
  private menuKey!: Phaser.Input.Keyboard.Key;
  private nightKey!: Phaser.Input.Keyboard.Key;
  private dialog!: DialogManager;
  private menu!: MenuManager;
  private tokenBank!: TokenBank;
  private night!: NightOverlay;
  private hint!: PixelLabel;
  private toast!: PixelLabel;
  private toastEvent: Phaser.Time.TimerEvent | null = null;
  private walkClock = 0;
  private pickupSprites: { flag: string; sprite: Phaser.GameObjects.Image }[] = [];
  private nightOn = false;
  private entry: WorldEntry = {};

  constructor() {
    super({ key: 'WorldScene' });
  }

  init(entry: WorldEntry): void {
    this.entry = entry ?? {};
  }

  create(): void {
    const mapId = this.entry.mapId ?? 'nussstadt';
    this.mapDef = MAPS[mapId];
    this.nightOn = mapId === 'hideout';
    const { tile } = GAME_CONFIG;
    const worldWidth = this.mapDef.cols * tile;
    const worldHeight = this.mapDef.rows * tile;

    this.drawWorld();
    this.night = new NightOverlay(this, worldWidth, worldHeight);
    this.night.setEnabled(this.nightOn);

    const startX = this.entry.tileX ?? this.mapDef.spawn.x;
    const startY = this.entry.tileY ?? this.mapDef.spawn.y;
    this.mover = new GridMover({
      tile,
      speed: GAME_CONFIG.walkSpeed,
      startTileX: startX,
      startTileY: startY,
      canWalk: (x, y) => isWalkable(this.mapDef, x, y),
    });
    if (this.entry.facing) {
      this.mover.facing = this.entry.facing;
    }

    this.player = this.add
      .sprite(this.mover.pixelX, this.mover.pixelY, 'player', 0)
      .setOrigin(0.5, 1);
    this.applyPlayerFrame();
    // Rooms smaller than the screen are centred instead of hugging the top-left.
    const viewW = GAME_CONFIG.width;
    const viewH = GAME_CONFIG.height;
    const boundsX = worldWidth < viewW ? Math.floor((worldWidth - viewW) / 2) : 0;
    const boundsY = worldHeight < viewH ? Math.floor((worldHeight - viewH) / 2) : 0;
    this.cameras.main.setBounds(boundsX, boundsY, Math.max(worldWidth, viewW), Math.max(worldHeight, viewH));
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    new PixelLabel(this, 6, 6, this.mapDef.name, { color: '#f7e7cf', background: 0x2a1f3d })
      .setScrollFactor(0)
      .setDepth(50);

    this.hint = new PixelLabel(this, 6, GAME_CONFIG.height - 20, 'ARROWS/WASD move   Z talk/read   X menu   N night', {
      color: '#e0d8ec',
      background: 0x2a1f3d,
      backgroundAlpha: 0.8,
    })
      .setScrollFactor(0)
      .setDepth(50);

    this.toast = new PixelLabel(this, GAME_CONFIG.width / 2, 22, '', {
      color: '#f7e7cf',
      background: 0x1e1036,
      padX: 6,
      padY: 4,
      centered: true,
    })
      .setScrollFactor(0)
      .setDepth(80)
      .setAlpha(0);

    this.dialog = new DialogManager(this);
    this.tokenBank = new TokenBank(this);
    this.menu = new MenuManager(this, () => ({
      mapId: this.mapDef.id,
      tileX: this.mover.tileX,
      tileY: this.mover.tileY,
      facing: this.mover.facing,
    }));

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('WorldScene requires keyboard input');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.actionKeys = [keyboard.addKey('Z'), keyboard.addKey('SPACE'), keyboard.addKey('ENTER')];
    this.menuKey = keyboard.addKey('X');
    this.nightKey = keyboard.addKey('N');

    this.playMapTheme();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number): void {
    this.hideCollectedPickups();
    this.dialog.update(delta);
    this.menu.update();
    this.tokenBank.update();
    const busy = this.dialog.isOpen || this.menu.isOpen || this.tokenBank.isOpen;
    this.hint.setVisible(!busy);
    if (busy) {
      return;
    }

    if (this.actionKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.tryInteract();
    }
    if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
      this.menu.open();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.nightKey)) {
      this.nightOn = !this.nightOn;
      this.night.setEnabled(this.nightOn);
      this.playMapTheme();
      return;
    }

    const wasMoving = this.mover.moving;
    const direction = this.readDirection();
    if (direction) {
      this.mover.tryStep(direction);
    }
    this.mover.update(delta);
    this.player.setPosition(this.mover.pixelX, this.mover.pixelY);
    if (this.mover.moving) {
      this.walkClock += delta;
    } else {
      this.walkClock = 0;
    }
    this.applyPlayerFrame();
    if (wasMoving && !this.mover.moving) {
      this.onStepComplete();
    }
  }

  private applyPlayerFrame(): void {
    const phase = this.mover.moving ? WALK_CYCLE[Math.floor(this.walkClock / WALK_PHASE_MS) % 4] : 0;
    this.player.setFrame(FACING_ROW[this.mover.facing] * 3 + phase);
    this.player.setFlipX(this.mover.facing === 'left');
  }

  private drawWorld(): void {
    const { tile } = GAME_CONFIG;
    this.add.image(0, 0, mapTextureKey(this.textures, this.mapDef)).setOrigin(0);

    for (const spot of this.mapDef.npcs) {
      const def = NPCS[spot.npcId];
      if (def) {
        this.add.sprite(spot.x * tile + tile / 2, (spot.y + 1) * tile, def.texture).setOrigin(0.5, 1);
      }
    }
    this.pickupSprites = [];
    for (const spot of this.mapDef.pickups) {
      if (hasFlag(spot.flag)) {
        continue;
      }
      const sprite = this.add.image(spot.x * tile + tile / 2, spot.y * tile + tile / 2, 'pickup');
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 2,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.pickupSprites.push({ flag: spot.flag, sprite });
    }
  }

  private hideCollectedPickups(): void {
    for (const entry of this.pickupSprites) {
      if (entry.sprite.visible && hasFlag(entry.flag)) {
        entry.sprite.setVisible(false);
      }
    }
  }

  private playMapTheme(): void {
    const base = MAP_THEMES[this.mapDef.id] ?? 'overworld';
    const theme = this.mapDef.outdoor && this.nightOn ? 'night' : base;
    audio.playTheme(theme);
  }

  private onStepComplete(): void {
    const door = doorAt(this.mapDef, this.mover.tileX, this.mover.tileY);
    if (door) {
      this.warp(door);
    }
  }

  private warp(door: DoorDef): void {
    audio.playSfx('sfx-door');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({
        mapId: door.targetMap,
        tileX: door.targetX,
        tileY: door.targetY,
        facing: door.facing ?? 'down',
      });
    });
  }

  private tryInteract(): void {
    const [dx, dy] = DELTAS[this.mover.facing];
    const tx = this.mover.tileX + dx;
    const ty = this.mover.tileY + dy;
    const ctx = this.storyContext();

    const pickup = pickupAt(this.mapDef, tx, ty);
    if (pickup && !hasFlag(pickup.flag)) {
      touchPickup(pickup, ctx);
      return;
    }

    const npc = npcAt(this.mapDef, tx, ty);
    if (npc) {
      const def = NPCS[npc.npcId];
      if (def?.flavor) {
        this.dialog.open(def.flavor);
      } else {
        talkTo(npc.npcId, ctx);
      }
      return;
    }

    const spot = signAt(this.mapDef, tx, ty);
    if (spot) {
      const script = SIGNS[spot.signId];
      if (script) {
        worldState.readSigns.add(spot.signId);
        this.dialog.open(script);
      }
    }
  }

  private storyContext(): StoryContext {
    return {
      scene: this,
      dialog: this.dialog,
      showToast: (message: string) => this.showToast(message),
      openTokenBank: () => this.tokenBank.open(),
    };
  }

  private showToast(message: string): void {
    this.toast.setText(message).setAlpha(1);
    this.toastEvent?.remove();
    this.toastEvent = this.time.delayedCall(2600, () => {
      this.toast.setAlpha(0);
    });
  }

  private readDirection(): Direction | null {
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      return 'left';
    }
    if (this.cursors.right.isDown || this.wasd.D.isDown) {
      return 'right';
    }
    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      return 'up';
    }
    if (this.cursors.down.isDown || this.wasd.S.isDown) {
      return 'down';
    }
    return null;
  }
}
