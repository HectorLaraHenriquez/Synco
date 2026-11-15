import Phaser from 'phaser';
import { app, session, VH, VW } from '../game/app';
import type { Session } from '../game/session';
import { reportIndicators } from '../sim/observe';
import { INDICATOR_KEYS } from '../sim/state';
import { t } from '../ui/i18n';
import { hora } from '../ui/labels';
import { PAL, semaforo } from '../ui/palette';
import { Monitors } from '../ui/sala/Monitors';
import { PaisView } from '../ui/sala/PaisView';
import { SymbolBoard } from '../ui/sala/SymbolBoard';
import { VsmDiagram } from '../ui/sala/VsmDiagram';
import { FONT_TITULO, SIMBOLOS, monitor, pantalla, simbolo, vtext } from '../ui/vector';

const TECHO = 64, PARED = 96, PISO = 640;
const PARPADEO_MS = 450;

/** La sala: vista principal. Las pantallas de la pared están vivas y cada una abre su panel de detalle. */
export class SalaScene extends Phaser.Scene {
  private ses!: Session;
  private dirty = true;
  private parpadeo = false;
  private acc = 0;
  private franja!: Phaser.GameObjects.Graphics;
  private valores: Phaser.GameObjects.Text[] = [];
  private reloj!: Phaser.GameObjects.Text;
  private pausa!: Phaser.GameObjects.Text;
  private pais!: PaisView;
  private vsm!: VsmDiagram;
  private tablero!: SymbolBoard;
  private monitores!: Monitors;

  constructor() {
    super('Sala');
  }

  private abrir(panel: number): void {
    this.scene.start('Opsroom', { panel });
  }

  create(): void {
    this.ses = session();
    this.valores = [];
    this.cameras.main.setBackgroundColor(PAL.negro);
    const g = this.add.graphics();

    // Pared de madera con junturas, anillo blanco del techo y piso.
    g.fillStyle(PAL.cafe);
    g.fillRect(0, PARED, VW, PISO - PARED);
    g.lineStyle(2, PAL.carbon, 0.5);
    for (let x = 0; x <= VW; x += 120) g.lineBetween(x, PARED, x, PISO);
    g.fillStyle(PAL.blanco);
    g.fillRect(0, TECHO, VW, PARED - TECHO);
    g.fillStyle(PAL.gris);
    g.fillRect(0, PARED - 6, VW, 6);
    g.fillStyle(PAL.carbon);
    g.fillRect(0, PISO, VW, VH - PISO);
    // Pliegues del hexágono: las paredes laterales se oscurecen.
    g.fillStyle(PAL.negro, 0.22);
    g.fillRect(0, PARED, 420, PISO - PARED);
    g.fillRect(1020, PARED, 420, PISO - PARED);

    // Pantallas de pared.
    const pVsm = pantalla(this, 60, 130, 330, 480, t('sala.vsm.titulo'), () => this.abrir(0));
    this.vsm = new VsmDiagram(this, pVsm, this.ses);
    const pPais = pantalla(this, 430, 130, 580, 290, t('sala.pais.titulo'), () => this.abrir(5));
    this.pais = new PaisView(this, pPais, this.ses, 580, 290);
    const pTab = pantalla(this, 1050, 130, 330, 480, '', () => this.abrir(4));
    this.tablero = new SymbolBoard(this, pTab, this.ses, 330);
    const mw = 168, mh = 130;
    const mons = [0, 1, 2].map((i) => monitor(this, 444 + i * 196, 462, mw, mh, () => this.abrir(i + 1))) as [Phaser.GameObjects.Container, Phaser.GameObjects.Container, Phaser.GameObjects.Container];
    this.monitores = new Monitors(this, mons, this.ses, mw, mh);

    // Sillas de fibra de vidrio y consola del apoyabrazos.
    const silla = (x: number): void => {
      g.fillStyle(PAL.gris);
      g.fillRect(x - 6, 740, 12, 60);
      g.fillEllipse(x, 800, 110, 18);
      g.fillStyle(PAL.blanco);
      g.fillEllipse(x, 720, 190, 120);
      g.fillStyle(PAL.naranjo);
      g.fillEllipse(x, 712, 130, 70);
    };
    silla(170);
    silla(1270);
    g.fillStyle(PAL.blanco);
    g.fillRoundedRect(470, 690, 500, 140, 40);
    g.fillStyle(PAL.cafe);
    g.fillRoundedRect(490, 706, 460, 120, 26);
    const boton = this.add.rectangle(720, 742, 400, 44, PAL.naranjo).setStrokeStyle(3, PAL.negro).setInteractive({ useHandCursor: true });
    boton.on('pointerdown', () => this.abrir(0));
    vtext(this, 720, 742, t('sala.consola'), 22, { color: PAL.negro, bold: true, font: FONT_TITULO, origin: [0.5, 0.5], spacing: 2 });
    vtext(this, 720, 786, t('sala.ayuda'), 14, { color: PAL.crema, origin: [0.5, 0.5] });

    // Franja superior: los siete indicadores con su símbolo.
    this.franja = this.add.graphics();
    INDICATOR_KEYS.forEach((k, i) => {
      const x = 16 + i * 168;
      vtext(this, x + 30, 8, t(`ind.franja.${k}`), 13, { color: PAL.gris, spacing: 1 });
      this.valores.push(vtext(this, x + 30, 24, '', 26, { bold: true, font: FONT_TITULO }));
    });
    this.reloj = vtext(this, VW - 20, 6, '', 26, { bold: true, font: FONT_TITULO, origin: [1, 0] });
    this.pausa = vtext(this, VW - 20, 38, '', 16, { color: PAL.naranjo, origin: [1, 0], spacing: 2 });

    const kb = this.input.keyboard!;
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.abrir(i)));
    kb.on('keydown-SPACE', () => this.ses.togglePause());
    kb.on('keydown-ENTER', () => this.abrir(0));
    kb.on('keydown-ESC', () => this.scene.start('Menu'));
    const off = this.ses.onChange(() => { this.dirty = true; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.dirty = true;
  }

  private refrescar(): void {
    const s = this.ses.state;
    const ind = reportIndicators(s, this.ses.ctx);
    const g = this.franja;
    g.clear();
    INDICATOR_KEYS.forEach((k, i) => {
      const x = 16 + i * 168, v = ind[k].valor, color = semaforo(v);
      simbolo(g, SIMBOLOS[i % SIMBOLOS.length]!, x + 13, 22, 10, color, true);
      this.valores[i]!.setText(String(Math.round(v))).setColor('#' + color.toString(16).padStart(6, '0'));
      g.fillStyle(PAL.carbon);
      g.fillRect(x + 72, 34, 80, 8);
      g.fillStyle(color);
      g.fillRect(x + 72, 34, (80 * v) / 100, 8);
    });
    this.reloj.setText(`${t('reloj.dia', { dia: s.day })} · ${hora(s.hour)}`);
    this.pausa.setText(this.ses.paused ? t('reloj.pausa') : this.ses.speed !== 1 ? `×${this.ses.speed}` : '');
    this.vsm.refresh();
    this.pais.refresh();
    this.tablero.refresh(this.parpadeo);
    this.monitores.refresh(this.parpadeo);
  }

  override update(_time: number, delta: number): void {
    this.ses.speed = app.speed;
    this.ses.advanceReal(delta);
    if (this.ses.dayOver) {
      app.lastClose = this.ses.closeDay();
      this.scene.start('DayReport');
      return;
    }
    this.acc += delta;
    if (this.acc >= PARPADEO_MS) {
      this.acc = 0;
      this.parpadeo = !this.parpadeo;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.refrescar();
    }
    this.pais.update(delta, this.ses.paused);
  }
}
