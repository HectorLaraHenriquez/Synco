import Phaser from 'phaser';
import { PAL } from '../palette';
import { txt, textW } from '../text';

export interface ButtonOpts { w?: number; h?: number; bg?: number; fg?: number; enabled?: boolean }

/** Botón rectangular con texto. El clic se despacha en pointerdown. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.BitmapText;
  private enabled = true;
  private readonly baseBg: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOpts = {}) {
    super(scene, x, y);
    const w = opts.w ?? textW(text) + 6;
    const h = opts.h ?? 11;
    this.baseBg = opts.bg ?? PAL.carbon;
    this.bg = scene.add.rectangle(0, 0, w, h, this.baseBg).setOrigin(0).setStrokeStyle(1, PAL.negro);
    this.label = txt(scene, Math.floor((w - textW(text)) / 2), Math.floor((h - 7) / 2), text, opts.fg ?? PAL.crema);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerdown', () => { if (this.enabled) onClick(); });
    this.bg.on('pointerover', () => { if (this.enabled) this.bg.setStrokeStyle(1, PAL.blanco); });
    this.bg.on('pointerout', () => this.bg.setStrokeStyle(1, PAL.negro));
    if (opts.enabled === false) this.setEnabled(false);
    scene.add.existing(this);
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.bg.setFillStyle(on ? this.baseBg : PAL.negro);
    this.label.setTint(on ? PAL.crema : PAL.gris);
    return this;
  }
}
