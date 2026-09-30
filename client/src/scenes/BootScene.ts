import * as Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.makeTextures();
    this.scene.start('TitleScene');
  }

  private makeTextures(): void {
    const floor = this.add.graphics();
    floor.fillStyle(0x2d1b4e, 1);
    floor.fillRect(0, 0, 16, 16);
    floor.fillStyle(0x261640, 1);
    floor.fillRect(0, 0, 8, 8);
    floor.fillRect(8, 8, 8, 8);
    floor.generateTexture('tile-floor', 16, 16);
    floor.destroy();

    const wall = this.add.graphics();
    wall.fillStyle(0x120a24, 1);
    wall.fillRect(0, 0, 16, 16);
    wall.fillStyle(0x1e1036, 1);
    wall.fillRect(0, 0, 16, 3);
    wall.generateTexture('tile-wall', 16, 16);
    wall.destroy();

    const player = this.add.graphics();
    player.fillStyle(0xe8c9a0, 1);
    player.fillRect(2, 6, 12, 16);
    player.fillStyle(0x7b2fbe, 1);
    player.fillRect(2, 2, 12, 6);
    player.fillStyle(0x000000, 1);
    player.fillRect(2, 12, 12, 3);
    player.generateTexture('player', 16, 24);
    player.destroy();

    const sign = this.add.graphics();
    sign.fillStyle(0x8a6a4a, 1);
    sign.fillRect(7, 8, 2, 8);
    sign.fillStyle(0xe8c9a0, 1);
    sign.fillRect(2, 2, 12, 8);
    sign.fillStyle(0x120a24, 1);
    sign.fillRect(4, 4, 8, 1);
    sign.fillRect(4, 7, 6, 1);
    sign.generateTexture('sign', 16, 16);
    sign.destroy();

    const pickup = this.add.graphics();
    pickup.fillStyle(0xf7e7cf, 1);
    pickup.fillRect(4, 6, 8, 6);
    pickup.fillStyle(0x7b2fbe, 1);
    pickup.fillRect(4, 4, 8, 3);
    pickup.fillStyle(0xe8c9a0, 1);
    pickup.fillRect(7, 2, 2, 3);
    pickup.generateTexture('pickup', 16, 16);
    pickup.destroy();

    this.makeNpc('npc-hickory', 0xe8c9a0, 0xf7e7cf);
    this.makeNpc('npc-rusty', 0xc4453c, 0x8e2f2a);
    this.makeNpc('npc-coco', 0x8a6a4a, 0x5a9c4e);
    this.makeNpc('npc-pip', 0x5a9c4e, 0x2f6b34);
    this.makeNpc('npc-djmac', 0xe8c9a0, 0x120a24);
    this.makeNpc('npc-kimi', 0xc4453c, 0x120a24);
    this.makeNpc('npc-receptionist', 0x7b2fbe, 0xf7e7cf);
    this.makeNpc('npc-civ-a', 0xc9a87c, 0x8a6a4a);
    this.makeNpc('npc-civ-b', 0xb0a8bd, 0x6b6478);
  }

  private makeNpc(key: string, body: number, accent: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(body, 1);
    gfx.fillRect(2, 6, 12, 16);
    gfx.fillStyle(accent, 1);
    gfx.fillRect(2, 2, 12, 6);
    gfx.fillStyle(0x120a24, 1);
    gfx.fillRect(2, 12, 12, 3);
    gfx.generateTexture(key, 16, 24);
    gfx.destroy();
  }
}
