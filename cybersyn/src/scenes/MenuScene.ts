import Phaser from 'phaser';
import { newGame, resumeGame, VH, VW } from '../game/app';
import { loadGame } from '../save/save';
import { t } from '../ui/i18n';
import { PAL } from '../ui/palette';
import { FONT_TITULO, SIMBOLOS, simbolo, vbutton, vtext } from '../ui/vector';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }
  create(): void {
    this.cameras.main.setBackgroundColor(PAL.negro);
    const g = this.add.graphics();
    // La sala en penumbra: hexágono, siete sillas y una franja naranja.
    g.fillStyle(PAL.carbon);
    g.fillPoints(Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(VW / 2 + 430 * Math.cos((Math.PI / 3) * i), 470 + 230 * Math.sin((Math.PI / 3) * i))), true);
    for (let i = 0; i < 7; i++) {
      const a = (2 * Math.PI * i) / 7 - Math.PI / 2;
      g.fillStyle(PAL.blanco);
      g.fillCircle(VW / 2 + 190 * Math.cos(a), 470 + 96 * Math.sin(a), 30);
      g.fillStyle(PAL.naranjo);
      g.fillCircle(VW / 2 + 190 * Math.cos(a), 470 + 96 * Math.sin(a), 18);
    }
    g.fillStyle(PAL.naranjo);
    g.fillRect(0, 0, VW, 14);
    SIMBOLOS.forEach((s, i) => simbolo(g, s, VW / 2 - 120 + i * 60, 236, 16, PAL.crema, i % 2 === 0));

    vtext(this, VW / 2, 110, t('menu.titulo'), 120, { bold: true, font: FONT_TITULO, origin: [0.5, 0.5], spacing: 14 });
    vtext(this, VW / 2, 188, t('menu.subtitulo'), 26, { color: PAL.naranjo, origin: [0.5, 0.5], spacing: 6 });

    const nueva = (): void => { newGame(); this.scene.start('City'); };
    const guardada = loadGame();
    vbutton(this, VW / 2 - 180, 610, 360, 56, t('menu.nueva'), nueva, { bg: PAL.naranjo, fg: PAL.negro, size: 26, font: FONT_TITULO });
    if (guardada) {
      vbutton(this, VW / 2 - 180, 678, 360, 48, t('menu.continuar', { dia: guardada.day }), () => { resumeGame(guardada); this.scene.start('City'); }, { size: 20 });
    }
    vtext(this, VW / 2, VH - 30, t('menu.pie'), 16, { color: PAL.gris, origin: [0.5, 0.5] });
    this.input.keyboard?.once('keydown-ENTER', nueva);
  }
}
