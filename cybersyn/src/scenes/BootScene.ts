import Phaser from 'phaser';
import { buildFont } from '../ui/text';

/** Prepara recursos generados (fuente bitmap) y pasa al menú. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    buildFont(this);
    this.scene.start('Menu');
  }
}
