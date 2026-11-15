import Phaser from 'phaser';
import { ZONE_IDS, type SectorId, type ZoneId } from '../../data/schemas';
import type { Session } from '../../game/session';
import { report, zonasCyberfolk } from '../../sim/observe';
import { PAL } from '../palette';
import { simbolo, vtext, type Simbolo } from '../vector';

const FORMA: Record<SectorId, Simbolo> = { MIN: 'triangulo', IND: 'cuadrado', CON: 'circulo', AGR: 'trianguloInv', ENT: 'pentagono' };
const COLOR: Record<SectorId, number> = { MIN: PAL.naranjo, IND: PAL.crema, CON: PAL.mostaza, AGR: PAL.verde_crt, ENT: PAL.blanco };
const Y_ESPINA = 150, Y_PUEBLO = 178, Y_COSTA = 212;
const PUERTOS: ZoneId[] = ['NG', 'VAL', 'BIO'];

interface Planta { x: number; y: number; r: number; sector: SectorId; id: string; nivel: number }
interface Pueblo { x: number; luces: number; cola: number; critico: boolean; medidor: boolean }

/**
 * Ventana al país: Chile de norte (izquierda) a sur (derecha) como un sistema nervioso.
 * Plantas que laten según su producción, camiones por la espina, barcos de cobre e importaciones,
 * ventanas encendidas según el ánimo y colas según el desabastecimiento. Sólo datos reportados.
 */
export class PaisView {
  private g: Phaser.GameObjects.Graphics;
  private plantas: Planta[] = [];
  private pueblos: Pueblo[] = [];
  private camiones: { t: number; v: number }[] = [];
  private nCamiones = 0;
  private barcosOut = 0;
  private barcosIn = 0;
  private alertas: { x: number; y: number }[] = [];
  private reloj = 0;
  private readonly cw: number;

  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private session: Session, private w: number, private h: number) {
    this.cw = (w - 20) / ZONE_IDS.length;
    const fondo = scene.add.graphics();
    // Cordillera, tierra y mar: tres bandas planas.
    fondo.fillStyle(PAL.carbon);
    for (let x = 10; x + 29 <= w - 10; x += 28) fondo.fillTriangle(x, 70, x + 28, 70, x + 14, 44 + ((x * 7) % 13));
    fondo.fillRect(10, 70, w - 20, Y_COSTA - 70);
    fondo.fillStyle(PAL.azul);
    fondo.fillRect(10, Y_COSTA, w - 20, h - Y_COSTA - 26);
    fondo.lineStyle(1, PAL.negro, 0.5);
    ZONE_IDS.forEach((z, i) => {
      if (i > 0) fondo.lineBetween(10 + i * this.cw, 70, 10 + i * this.cw, Y_COSTA);
      parent.add(vtext(scene, this.cx(i), h - 22, session.ctx.zone[z].nombre.toUpperCase(), 11, { color: PAL.gris, origin: [0.5, 0] }));
    });
    fondo.lineStyle(3, PAL.crema);
    PUERTOS.forEach((z) => fondo.lineBetween(this.cx(ZONE_IDS.indexOf(z)) - 22, Y_COSTA, this.cx(ZONE_IDS.indexOf(z)) - 22, Y_COSTA + 16));
    parent.addAt(fondo, 2);

    // Posición fija de cada planta dentro de su zona.
    const porZona: Record<string, number> = {};
    for (const f of Object.values(session.state.firms)) {
      const zi = ZONE_IDS.indexOf(f.zona);
      const k = (porZona[f.zona] = (porZona[f.zona] ?? 0) + 1) - 1;
      this.plantas.push({
        x: 10 + zi * this.cw + 12 + (k % 4) * ((this.cw - 20) / 4) + 4,
        y: 128 - Math.floor(k / 4) * 20, r: 4 + Math.min(4, f.capacidad / 8), sector: f.sector, id: f.id, nivel: 1,
      });
    }
    for (let i = 0; i < 26; i++) this.camiones.push({ t: (i * 0.618) % 1, v: (i % 2 === 0 ? 1 : -1) * (0.03 + (i % 5) * 0.006) });
    this.g = scene.add.graphics();
    parent.add(this.g);
  }

  private cx(i: number): number {
    return 10 + (i + 0.5) * this.cw;
  }

  /** Relee los datos reportados (cuando cambia el estado). */
  refresh(): void {
    const { state: s, ctx } = this.session;
    for (const p of this.plantas) {
      const f = s.firms[p.id]!;
      p.nivel = f.capacidad > 0 ? report(s, ctx, `firm:${f.id}`, 'produccion').valor / f.capacidad : 0;
    }
    const conMedidor = zonasCyberfolk(s, ctx);
    this.pueblos = ZONE_IDS.map((z, i) => {
      const abast = report(s, ctx, `zone:${z}`, 'abastecimiento').valor;
      const medidor = conMedidor.includes(z);
      return {
        x: this.cx(i), medidor, critico: abast < 45,
        luces: medidor ? Math.round(report(s, ctx, `zone:${z}`, 'animo').valor / 20) : 0,
        cola: Phaser.Math.Clamp(Math.round((100 - abast) / 8), 0, 9),
      };
    });
    this.nCamiones = Math.round((report(s, ctx, 'pais', 'abastecimiento').valor / 100) * this.camiones.length);
    const min = report(s, ctx, 'sector:MIN', 'utilizacion').valor;
    this.barcosOut = min > 0.6 ? 3 : min > 0.35 ? 2 : min > 0.1 ? 1 : 0;
    const div = report(s, ctx, 'pais', 'divisas').valor;
    this.barcosIn = div > 10 ? 2 : div > 0.5 ? 1 : 0;
    this.alertas = s.algedonic.filter((a) => !a.atendida).flatMap((a) => {
      if (a.origen.tipo === 'ZONE') return [{ x: this.cx(ZONE_IDS.indexOf(a.origen.id as ZoneId)), y: Y_PUEBLO }];
      const p = this.plantas.find((q) => q.id === a.origen.id);
      return p ? [{ x: p.x, y: p.y }] : [];
    });
  }

  /** Anima y redibuja (cada cuadro). */
  update(dtMs: number, pausado: boolean): void {
    if (!pausado) this.reloj += dtMs / 1000;
    const g = this.g, T = this.reloj, x0 = 10, x1 = this.w - 10;
    g.clear();

    // Espina: red Cybernet y ruta longitudinal.
    g.lineStyle(3, PAL.crema, 0.9);
    g.lineBetween(x0, Y_ESPINA, x1, Y_ESPINA);
    for (const p of this.plantas) {
      g.lineStyle(1, PAL.gris, 0.6);
      g.lineBetween(p.x, p.y, p.x, Y_ESPINA);
      const ok = p.nivel >= 0.6;
      const color = ok ? COLOR[p.sector] : p.nivel >= 0.4 ? PAL.mostaza : PAL.rojo;
      // Late con la producción: más rápido y lleno cuando produce bien.
      const latido = 0.75 + 0.25 * Math.sin(T * (2 + 4 * p.nivel) + p.x);
      g.setAlpha(ok ? latido : 1);
      simbolo(g, FORMA[p.sector], p.x, p.y, p.r, color, ok || Math.sin(T * 6) > 0);
      g.setAlpha(1);
    }
    // Camiones.
    g.fillStyle(PAL.crema);
    this.camiones.slice(0, this.nCamiones).forEach((c) => {
      if (!pausado) c.t = (c.t + c.v * (dtMs / 1000) + 1) % 1;
      g.fillRect(x0 + c.t * (x1 - x0) - 3, Y_ESPINA + (c.v > 0 ? -6 : 3), 6, 3);
    });
    // Pueblos: ventanas encendidas = ánimo; cola = desabastecimiento.
    for (const p of this.pueblos) {
      for (let k = 0; k < 5; k++) {
        const encendida = k < p.luces;
        g.fillStyle(encendida ? PAL.mostaza : PAL.negro);
        g.fillRect(p.x - 24 + k * 10, Y_PUEBLO - (k % 2) * 4, 8, 8 + (k % 2) * 4);
        if (!p.medidor) { g.lineStyle(1, PAL.gris); g.strokeRect(p.x - 24 + k * 10, Y_PUEBLO - (k % 2) * 4, 8, 8 + (k % 2) * 4); }
      }
      g.fillStyle(p.critico ? PAL.rojo : PAL.crema);
      for (let k = 0; k < p.cola; k++) g.fillCircle(p.x - 24 + k * 6, Y_PUEBLO + 20 + (p.critico ? Math.sin(T * 5 + k) : 0), 2);
    }
    // Barcos: cobre que sale (naranjo) e importaciones que llegan (crema).
    const barco = (x: number, y: number, color: number): void => {
      g.fillStyle(color);
      g.fillRect(x - 9, y, 18, 5);
      g.fillTriangle(x + 9, y, x + 15, y, x + 9, y + 5);
      g.fillRect(x - 3, y - 5, 6, 5);
    };
    const pNG = this.cx(0) - 22, pVAL = this.cx(2) - 22, mar = this.h - 26 - Y_COSTA - 22;
    for (let k = 0; k < this.barcosOut; k++) {
      const u = (T * 0.05 + k / 3) % 1;
      barco(pNG - u * 40 + 14, Y_COSTA + 18 + u * mar, PAL.naranjo);
    }
    for (let k = 0; k < this.barcosIn; k++) {
      const u = 1 - ((T * 0.04 + k / 2) % 1);
      barco(pVAL + 14 + u * 60, Y_COSTA + 18 + u * mar, PAL.crema);
    }
    // Señales algedónicas: anillo rojo que se expande en el origen.
    for (const a of this.alertas) {
      const u = (T * 1.2) % 1;
      g.lineStyle(3, PAL.rojo, 1 - u);
      g.strokeCircle(a.x, a.y, 8 + u * 22);
      g.lineStyle(2, PAL.rojo);
      g.strokeCircle(a.x, a.y, 9);
    }
  }
}
