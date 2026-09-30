import * as Phaser from 'phaser';

const NIGHT_TINT = 0x4a4a7a;

export class NightOverlay {
  private readonly rect: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.rect = scene.add
      .rectangle(0, 0, worldWidth, worldHeight, NIGHT_TINT)
      .setOrigin(0)
      .setDepth(45)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setVisible(false);
  }

  setEnabled(enabled: boolean): void {
    this.rect.setVisible(enabled);
  }
}
