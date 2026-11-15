import Phaser from 'phaser';
import { PAL } from '../palette';

/** Barra horizontal 0–100 (placeholder de H3; H4 agrega marcas y patrones). */
export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, value: number, color: number, bg: number = PAL.negro): Phaser.GameObjects.Rectangle[] {
  const fill = Math.round((Math.min(100, Math.max(0, value)) / 100) * w);
  return [
    scene.add.rectangle(x, y, w, h, bg).setOrigin(0),
    scene.add.rectangle(x, y, fill, h, color).setOrigin(0),
  ];
}
