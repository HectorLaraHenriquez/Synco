import Phaser from 'phaser';
import { session, VH, VW } from '../game/app';
import { buildBulletin } from '../game/bulletin';
import { saveGame } from '../save/save';
import { hashNoise } from '../sim/rng';
import { t } from '../ui/i18n';
import { fmt } from '../ui/labels';
import { PAL } from '../ui/palette';
import { FONT_TITULO, vbutton, vparrafo, vtext } from '../ui/vector';

const SUELO = 640;

/**
 * La ciudad: Santiago visto desde lejos. Es la pantalla de la historia: abre cada jornada
 * con el boletín y las voces de la calle. La economía se maneja dentro de la sala.
 */
export class CityScene extends Phaser.Scene {
  private visita = false;

  constructor() {
    super('City');
  }
  init(data: { visita?: boolean }): void {
    this.visita = data.visita === true;
  }

  create(): void {
    const ses = session();
    const s = ses.state;
    if (!this.visita) saveGame(s);
    const ultimo = s.history[s.history.length - 1];
    const animo = ultimo?.indicators.animo ?? s.indicators.animo;
    const calidad = ultimo?.calidadVida ?? 60;
    this.cameras.main.setBackgroundColor(PAL.azul);
    const g = this.add.graphics();

    // Sol, cordillera nevada y cerros.
    g.fillStyle(PAL.naranjo);
    g.fillCircle(1180, 170, 70);
    for (let i = 0; i < 9; i++) {
      const x = -60 + i * 190, h = 250 + ((i * 53) % 90);
      g.fillStyle(PAL.gris);
      g.fillTriangle(x, SUELO, x + 320, SUELO, x + 160, SUELO - h);
      g.fillStyle(PAL.blanco);
      g.fillTriangle(x + 160 - 45, SUELO - h + 70, x + 160 + 45, SUELO - h + 70, x + 160, SUELO - h);
    }
    g.fillStyle(PAL.verde_osc);
    g.fillEllipse(260, SUELO, 520, 190);
    g.fillEllipse(1250, SUELO, 620, 150);

    // Ciudad: crece con los días y la calidad de vida; las ventanas encendidas siguen al ánimo.
    const n = 16 + Math.min(14, Math.floor(s.day / 2));
    const ancho = VW / n;
    for (let i = 0; i < n; i++) {
      const r = (hashNoise(s.seed, 0, `edificio${i}`) + 1) / 2;
      const alto = 60 + r * 150 + (calidad - 50) * 1.2 + Math.min(60, s.day * 2) * r;
      const x = i * ancho, w = ancho - 6;
      g.fillStyle(i % 3 === 0 ? PAL.negro : PAL.carbon);
      g.fillRect(x, SUELO - alto, w, alto);
      for (let fy = SUELO - alto + 10; fy < SUELO - 14; fy += 18) {
        for (let fx = x + 6; fx < x + w - 10; fx += 14) {
          const lit = (hashNoise(s.seed, s.day, `v${i}.${fx}.${fy}`) + 1) * 50 < animo;
          g.fillStyle(lit ? PAL.mostaza : PAL.cafe);
          g.fillRect(fx, fy, 8, 10);
        }
      }
    }
    g.fillStyle(PAL.carbon);
    g.fillRect(0, SUELO, VW, VH - SUELO);
    g.fillStyle(PAL.cafe);
    g.fillRect(0, SUELO, VW, 10);

    // Voces de la calle (del último cierre) como globos de diálogo.
    (ultimo?.voces ?? []).slice(0, 3).forEach((v, i) => {
      const x = 60 + i * 250, y = 330 + (i % 2) * 90;
      const tx = vparrafo(this, x + 14, y + 10, v.texto, 17, 200, { color: PAL.negro });
      const h = tx.height + 22;
      g.fillStyle(v.tono === 'NEG' ? PAL.crema : PAL.blanco);
      g.fillRoundedRect(x, y, 228, h, 12);
      g.fillTriangle(x + 40, y + h, x + 66, y + h, x + 44, y + h + 22);
      g.fillStyle(v.tono === 'NEG' ? PAL.rojo : PAL.verde_osc);
      g.fillRect(x, y, 8, h);
    });

    // Boletín del día.
    const b = buildBulletin(s, ses.ctx);
    const X = 860, Y = 60, W = 520;
    g.fillStyle(PAL.crema);
    g.fillRect(X, Y, W, 600);
    g.fillStyle(PAL.naranjo);
    g.fillRect(X, Y, W, 12);
    g.fillStyle(PAL.negro);
    g.fillRect(X + 24, Y + 78, W - 48, 3);
    const fecha = s.day <= 28 ? t('boletin.fecha', { n: s.day + 3, mes: t('mes.marzo') }) : t('boletin.fecha', { n: s.day - 28, mes: t('mes.abril') });
    vtext(this, X + 24, Y + 28, t('boletin.cabecera'), 30, { color: PAL.negro, bold: true, font: FONT_TITULO, spacing: 4 });
    vtext(this, X + W - 24, Y + 40, `${t('reloj.dia', { dia: s.day })} · ${fecha}`, 16, { color: PAL.cafe, origin: [1, 0] });
    const titular = vparrafo(this, X + 24, Y + 96, t(b.titular), 40, W - 48, { color: PAL.negro, bold: true, font: FONT_TITULO });
    let y = Y + 96 + titular.height + 14;
    const parrafo = (texto: string, color: number, size = 17): void => {
      const p = vparrafo(this, X + 24, y, texto, size, W - 48, { color });
      y += p.height + 12;
    };
    parrafo(t(b.objetivo), PAL.negro, 19);
    parrafo(t('boletin.cobre', { v: fmt(b.cobre, 2) }), PAL.cafe, 15);
    for (const k of b.novedades) parrafo(`● ${t(k)}`, PAL.verde_osc);
    if (b.jefa) parrafo(t(b.jefa), PAL.azul);

    const entrar = (): void => { this.scene.start('Sala'); };
    vbutton(this, X + 24, Y + 600 - 70, W - 48, 52, t(this.visita ? 'ciudad.volver' : 'ciudad.entrar'), entrar, { bg: PAL.naranjo, fg: PAL.negro, size: 24, font: FONT_TITULO });
    this.input.keyboard?.once('keydown-ENTER', entrar);
    vtext(this, 40, VH - 60, t('ciudad.titulo'), 34, { bold: true, font: FONT_TITULO, spacing: 6 });
    vtext(this, 40, VH - 110, t('ciudad.estado', { animo: fmt(animo), calidad: fmt(calidad) }), 18, { color: PAL.crema });
  }
}
