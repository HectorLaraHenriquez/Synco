import Phaser from 'phaser';
import { SECTOR_IDS, ZONE_IDS } from '../data/schemas';
import { app, session, VH, VW } from '../game/app';
import type { Session } from '../game/session';
import { reportIndicators } from '../sim/observe';
import { INDICATOR_KEYS, type NationalIndicators } from '../sim/state';
import { dibujarFicha, FH, FW, tituloFicha, type FichaId } from '../ui/fichas';
import { t } from '../ui/i18n';
import { hora } from '../ui/labels';
import { PAL, semaforo } from '../ui/palette';
import { Monitors } from '../ui/sala/Monitors';
import { PaisView } from '../ui/sala/PaisView';
import { SymbolBoard } from '../ui/sala/SymbolBoard';
import { VsmDiagram } from '../ui/sala/VsmDiagram';
import { FONT_TITULO, SIMBOLOS, hex, monitor, pantalla, simbolo, vbutton, vtext } from '../ui/vector';

const TECHO = 64, PARED = 96, PISO = 640;
const PARPADEO_MS = 450;
const ERROR_MS = 4000;
const FX = (VW - FW) / 2, FY = 132;

/** La sala: vista principal. Las pantallas de la pared están vivas y cada elemento abre su ficha. */
export class SalaScene extends Phaser.Scene {
  private ses!: Session;
  private dirty = true;
  private parpadeo = false;
  private acc = 0;
  private franja!: Phaser.GameObjects.Graphics;
  private valores: Phaser.GameObjects.Text[] = [];
  private reloj!: Phaser.GameObjects.Text;
  private pausa!: Phaser.GameObjects.Text;
  private aviso!: Phaser.GameObjects.Text;
  private borrador!: Phaser.GameObjects.Text;
  private pais!: PaisView;
  private vsm!: VsmDiagram;
  private tablero!: SymbolBoard;
  private monitores!: Monitors;
  private ficha?: FichaId;
  private capa!: Phaser.GameObjects.Container;
  private contenido!: Phaser.GameObjects.Container;
  private tituloFicha!: Phaser.GameObjects.Text;
  private ui: { checoInd: keyof NationalIndicators } = { checoInd: 'abastecimiento' };

  constructor() {
    super('Sala');
  }

  private abrir(f: FichaId | undefined): void {
    this.ficha = f;
    this.dirty = true;
  }

  /** Zona sensible invisible sobre una pantalla. */
  private zona(x: number, y: number, w: number, h: number, onClick: () => void): void {
    this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }

  create(): void {
    this.ses = session();
    this.valores = [];
    this.ficha = undefined;
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

    // Pantallas de pared y sus zonas sensibles.
    const pVsm = pantalla(this, 60, 130, 330, 480, t('sala.vsm.titulo'));
    this.vsm = new VsmDiagram(this, pVsm, this.ses);
    SECTOR_IDS.forEach((id, i) => this.zona(60, 130 + 205 - 29 + i * 58, 330, 58, () => this.abrir({ tipo: 'sector', id })));
    const pPais = pantalla(this, 430, 130, 580, 290, t('sala.pais.titulo'));
    this.pais = new PaisView(this, pPais, this.ses, 580, 290);
    const cw = 560 / ZONE_IDS.length;
    ZONE_IDS.forEach((id, i) => this.zona(440 + i * cw, 160, cw, 240, () => this.abrir({ tipo: 'zona', id })));
    const pTab = pantalla(this, 1050, 130, 330, 480, '');
    this.tablero = new SymbolBoard(this, pTab, this.ses, 330);
    SECTOR_IDS.forEach((id, i) => this.zona(1050, 130 + 92 + i * 36, 330, 36, () => this.abrir({ tipo: 'sector', id })));
    ZONE_IDS.forEach((id, i) => this.zona(1050 + 50 + (i % 4) * 78 - 36, 130 + 318 + 38 + Math.floor(i / 4) * 72 - 34, 72, 62, () => this.abrir({ tipo: 'zona', id })));
    const mw = 168, mh = 130;
    const fichas: FichaId[] = [{ tipo: 'stride' }, { tipo: 'checo' }, { tipo: 'algedonico' }];
    const mons = fichas.map((f, i) => monitor(this, 444 + i * 196, 462, mw, mh, () => this.abrir(f))) as [Phaser.GameObjects.Container, Phaser.GameObjects.Container, Phaser.GameObjects.Container];
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
    g.fillRoundedRect(420, 664, 600, 170, 40);
    g.fillStyle(PAL.cafe);
    g.fillRoundedRect(440, 680, 560, 150, 26);
    vbutton(this, 460, 696, 330, 50, t('sala.consola'), () => this.abrir({ tipo: 'consola' }), { bg: PAL.naranjo, fg: PAL.negro, size: 22, font: FONT_TITULO });
    vbutton(this, 804, 696, 176, 50, t('sala.ciudad'), () => this.scene.start('City', { visita: true }), { size: 17 });
    this.borrador = vtext(this, 720, 766, '', 15, { color: PAL.crema, origin: [0.5, 0.5] });
    vtext(this, 720, 792, t('sala.ayuda'), 13, { color: PAL.crema, origin: [0.5, 0.5] });

    // Franja superior: los siete indicadores con su símbolo.
    this.franja = this.add.graphics();
    INDICATOR_KEYS.forEach((k, i) => {
      const x = 16 + i * 168;
      vtext(this, x + 30, 8, t(`ind.franja.${k}`), 13, { color: PAL.gris, spacing: 1 });
      this.valores.push(vtext(this, x + 30, 24, '', 26, { bold: true, font: FONT_TITULO }));
    });
    this.reloj = vtext(this, VW - 20, 6, '', 26, { bold: true, font: FONT_TITULO, origin: [1, 0] });
    this.pausa = vtext(this, VW - 20, 38, '', 16, { color: PAL.naranjo, origin: [1, 0], spacing: 2 });

    // Capa de ficha (oculta hasta que se abre una).
    this.capa = this.add.container(0, 0).setVisible(false);
    const velo = this.add.rectangle(0, TECHO, VW, VH - TECHO, PAL.negro, 0.7).setOrigin(0).setInteractive();
    velo.on('pointerdown', () => this.abrir(undefined));
    const marco = this.add.rectangle(FX - 12, FY - 52, FW + 24, FH + 64, PAL.carbon).setOrigin(0).setStrokeStyle(3, PAL.naranjo).setInteractive();
    const vidrio = this.add.rectangle(FX, FY, FW, FH, PAL.negro).setOrigin(0);
    this.tituloFicha = vtext(this, FX + 8, FY - 42, '', 24, { bold: true, font: FONT_TITULO, spacing: 2 });
    this.contenido = this.add.container(FX, FY);
    this.capa.add([velo, marco, vidrio, this.tituloFicha, vbutton(this, FX + FW - 120, FY - 44, 120, 32, t('ficha.cerrar'), () => this.abrir(undefined), { size: 15 }), this.contenido]);
    this.aviso = vtext(this, VW / 2, FY + FH + 26, '', 18, { color: PAL.blanco, origin: [0.5, 0.5], bold: true }).setBackgroundColor(hex(PAL.rojo)).setPadding(10, 4).setVisible(false);

    const kb = this.input.keyboard!;
    const teclas: [string, FichaId][] = [['ONE', { tipo: 'consola' }], ['TWO', { tipo: 'stride' }], ['THREE', { tipo: 'checo' }], ['FOUR', { tipo: 'algedonico' }]];
    teclas.forEach(([k, f]) => kb.on(`keydown-${k}`, () => this.abrir(f)));
    kb.on('keydown-SPACE', () => this.ses.togglePause());
    kb.on('keydown-ENTER', () => (this.ficha?.tipo === 'consola' ? void this.ses.dispatch({ t: 'EXECUTE_LEVERS' }) : this.abrir({ tipo: 'consola' })));
    kb.on('keydown-ESC', () => (this.ficha ? this.abrir(undefined) : this.scene.start('Menu')));
    const off = this.ses.onChange(() => { this.dirty = true; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.dirty = true;
  }

  private refrescarTableros(): void {
    this.tablero.refresh(this.parpadeo);
    this.monitores.refresh(this.parpadeo);
  }

  private refrescar(): void {
    const s = this.ses.state;
    const ind = reportIndicators(s, this.ses.ctx);
    const g = this.franja;
    g.clear();
    INDICATOR_KEYS.forEach((k, i) => {
      const x = 16 + i * 168, v = ind[k].valor, color = semaforo(v);
      simbolo(g, SIMBOLOS[i % SIMBOLOS.length]!, x + 13, 22, 10, color, true);
      this.valores[i]!.setText(String(Math.round(v))).setColor(hex(color));
      g.fillStyle(PAL.carbon);
      g.fillRect(x + 72, 34, 80, 8);
      g.fillStyle(color);
      g.fillRect(x + 72, 34, (80 * v) / 100, 8);
    });
    this.reloj.setText(`${t('reloj.dia', { dia: s.day })} · ${hora(s.hour)}`);
    this.pausa.setText(this.ses.paused ? t('reloj.pausa') : this.ses.speed !== 1 ? `×${this.ses.speed}` : '');
    const nBorrador = Object.keys(s.draftLevers).length;
    this.borrador.setText(nBorrador > 0 ? t('sala.borrador', { n: nBorrador }) : t('sala.sinBorrador')).setColor(hex(nBorrador > 0 ? PAL.mostaza : PAL.crema));
    this.vsm.refresh();
    this.pais.refresh();
    this.refrescarTableros();

    this.capa.setVisible(this.ficha !== undefined);
    this.contenido.removeAll(true);
    if (this.ficha) {
      const x = { scene: this, c: this.contenido, ses: this.ses, abrir: (f: FichaId) => this.abrir(f), ui: this.ui };
      this.tituloFicha.setText(tituloFicha(this.ficha, x));
      dibujarFicha(this.ficha, x);
    }
  }

  override update(_time: number, delta: number): void {
    this.ses.speed = app.speed;
    this.ses.advanceReal(delta);
    if (this.ses.dayOver) {
      app.lastClose = this.ses.closeDay();
      this.scene.start('DayReport');
      return;
    }
    if (this.dirty) {
      this.dirty = false;
      this.refrescar();
    }
    this.acc += delta;
    if (this.acc >= PARPADEO_MS) {
      this.acc = 0;
      this.parpadeo = !this.parpadeo;
      this.refrescarTableros();
    }
    const err = this.ses.lastError;
    const visible = err !== undefined && this.ses.now - err.realMs < ERROR_MS;
    this.aviso.setVisible(visible);
    if (visible) this.aviso.setText(t(`error.${err.code}`));
    this.pais.update(delta, this.ses.paused);
  }
}
