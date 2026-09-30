import * as Phaser from 'phaser';
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
import { type Direction, DELTAS, GridMover } from '../systems/movement';
import { hasFlag } from '../systems/quests';
import { worldState } from '../systems/save';
import { type StoryContext, talkTo, touchPickup } from '../systems/story';
import { showTokenClaim } from '../systems/tokens';
import { DialogManager } from '../ui/DialogManager';
import { MenuManager } from '../ui/MenuManager';
import { QRPanel } from '../ui/QRPanel';
import { TokenBank } from '../ui/TokenBank';

interface WorldEntry {
  mapId?: string;
  tileX?: number;
  tileY?: number;
  facing?: Direction;
}

const WATER_COLOR = 0x2c5f8a;
const WALL_COLOR = 0x1e1036;
const DOOR_COLOR = 0xc9a87c;

export class WorldScene extends Phaser.Scene {
  private mapDef!: MapDef;
  private mover!: GridMover;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionKeys!: Phaser.Input.Keyboard.Key[];
  private menuKey!: Phaser.Input.Keyboard.Key;
  private dialog!: DialogManager;
  private menu!: MenuManager;
  private qrPanel!: QRPanel;
  private tokenBank!: TokenBank;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastEvent: Phaser.Time.TimerEvent | null = null;
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
    const { tile } = GAME_CONFIG;
    const worldWidth = this.mapDef.cols * tile;
    const worldHeight = this.mapDef.rows * tile;

    this.drawWorld();

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

    this.player = this.add.sprite(this.mover.pixelX, this.mover.pixelY, 'player').setOrigin(0.5, 1);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    this.add
      .text(8, 6, this.mapDef.name, {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#e8c9a0',
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.hint = this.add
      .text(8, GAME_CONFIG.height - 18, 'ARROWS/WASD move   Z talk/read   X menu', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#b0a8bd',
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.toast = this.add
      .text(GAME_CONFIG.width / 2, 28, '', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#f7e7cf',
        backgroundColor: '#1e1036',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(80)
      .setAlpha(0);

    this.dialog = new DialogManager(this);
    this.qrPanel = new QRPanel(this);
    this.tokenBank = new TokenBank(this, (milestoneId) => {
      void showTokenClaim(this.storyContext(), milestoneId);
    });
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

    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  update(_time: number, delta: number): void {
    this.dialog.update(delta);
    this.menu.update();
    this.qrPanel.update();
    this.tokenBank.update();
    const busy = this.dialog.isOpen || this.menu.isOpen || this.qrPanel.isOpen || this.tokenBank.isOpen;
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

    const wasMoving = this.mover.moving;
    const direction = this.readDirection();
    if (direction) {
      this.mover.tryStep(direction);
    }
    this.mover.update(delta);
    this.player.setPosition(this.mover.pixelX, this.mover.pixelY);
    if (wasMoving && !this.mover.moving) {
      this.onStepComplete();
    }
  }

  private drawWorld(): void {
    const { tile } = GAME_CONFIG;
    this.add
      .tileSprite(0, 0, this.mapDef.cols * tile, this.mapDef.rows * tile, 'tile-floor')
      .setOrigin(0);

    const graphics = this.add.graphics();
    graphics.fillStyle(WATER_COLOR, 1);
    for (const rect of this.mapDef.water) {
      graphics.fillRect(rect.x * tile, rect.y * tile, rect.w * tile, rect.h * tile);
    }
    graphics.fillStyle(WALL_COLOR, 1);
    for (const rect of this.mapDef.walls) {
      graphics.fillRect(rect.x * tile, rect.y * tile, rect.w * tile, rect.h * tile);
    }
    graphics.fillStyle(DOOR_COLOR, 1);
    for (const door of this.mapDef.doors) {
      graphics.fillRect(door.x * tile + 2, door.y * tile + 2, tile - 4, tile - 2);
    }

    for (const spot of this.mapDef.signs) {
      this.add.image(spot.x * tile + tile / 2, spot.y * tile + tile / 2, 'sign');
    }

    for (const spot of this.mapDef.npcs) {
      const def = NPCS[spot.npcId];
      if (def) {
        this.add.sprite(spot.x * tile + tile / 2, (spot.y + 1) * tile, def.texture).setOrigin(0.5, 1);
      }
    }

    for (const spot of this.mapDef.pickups) {
      if (!hasFlag(spot.flag)) {
        this.add.image(spot.x * tile + tile / 2, spot.y * tile + tile / 2, 'pickup');
      }
    }
  }

  private onStepComplete(): void {
    const door = doorAt(this.mapDef, this.mover.tileX, this.mover.tileY);
    if (door) {
      this.warp(door);
    }
  }

  private warp(door: DoorDef): void {
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
      qr: this.qrPanel,
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
