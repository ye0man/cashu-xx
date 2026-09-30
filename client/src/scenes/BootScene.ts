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
  }
}
