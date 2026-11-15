import Phaser from 'phaser';
import { H, W, newGame } from '../game/app';
import { t } from '../ui/i18n';
import { PAL } from '../ui/palette';
import { txt, textW } from '../ui/text';
import { Button } from '../ui/widgets/Button';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }
  create(): void {
    this.cameras.main.setBackgroundColor(PAL.negro);
    // Opsroom en penumbra: hexágono y sillas como bloques geométricos.
    const g = this.add.graphics();
    g.fillStyle(PAL.carbon);
    g.fillPoints(Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(W / 2 + 150 * Math.cos((Math.PI / 3) * i), 150 + 70 * Math.sin((Math.PI / 3) * i))), true);
    g.fillStyle(PAL.cafe);
    for (let i = 0; i < 7; i++) g.fillCircle(W / 2 + 70 * Math.cos((2 * Math.PI * i) / 7), 150 + 30 * Math.sin((2 * Math.PI * i) / 7), 6);
    g.fillStyle(PAL.naranjo);
    g.fillRect(0, 0, W, 6);

    const titulo = t('menu.titulo');
    txt(this, (W - textW(titulo, 3)) / 2, 24, titulo, PAL.crema, 3);
    const sub = t('menu.subtitulo');
    txt(this, (W - textW(sub)) / 2, 54, sub, PAL.naranjo);

    const start = (): void => {
      newGame();
      this.scene.start('Opsroom');
    };
    new Button(this, W / 2 - 60, 200, t('menu.nueva'), start, { w: 120, h: 15, bg: PAL.naranjo, fg: PAL.negro });
    const pie = t('menu.pie');
    txt(this, (W - textW(pie)) / 2, H - 14, pie, PAL.gris);
    this.input.keyboard?.once('keydown-ENTER', start);
  }
}
