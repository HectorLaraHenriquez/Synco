import Phaser from 'phaser';
import { SECTOR_IDS } from '../../data/schemas';
import type { Session } from '../../game/session';
import { report } from '../../sim/observe';
import { t } from '../i18n';
import { PAL } from '../palette';
import { estadoSector } from '../status';
import { vtext } from '../vector';

const ROW0 = 205;
const ROW_H = 58;
const X_NUBE = 48, X_CIRC = 132, X_CAJA = 216, X_TRI = 292;
const CAJA = 40;

/** Diagrama de flujo del Modelo de Sistema Viable, como las diapositivas de la Opsroom real. */
export class VsmDiagram {
  private dyn: Phaser.GameObjects.Graphics;
  private valores: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private session: Session) {
    const g = scene.add.graphics();
    parent.add(g);
    const y = (i: number): number => ROW0 + i * ROW_H;

    // S2 coordinación: bus azul que une los triángulos y sube al nivel superior.
    g.lineStyle(4, PAL.azul);
    g.lineBetween(X_TRI + 18, y(0), X_TRI + 18, y(4));
    g.strokeRoundedRect(X_CAJA - 70, 62, 140, 150, 60);
    // Conectores amarillos entre círculos (las operaciones se hablan entre sí).
    g.fillStyle(PAL.mostaza);
    g.fillRect(X_CIRC - 5, y(0), 10, y(4) - y(0));
    // Disco naranjo: el país (metasistema).
    g.fillStyle(PAL.naranjo);
    g.fillCircle(X_CAJA, 122, 52);
    g.fillStyle(PAL.blanco);
    g.fillRect(X_CAJA - 26, 40, 52, 26);
    g.fillRect(X_CAJA - CAJA / 2, 100, CAJA, CAJA);
    parent.add(vtext(scene, X_CAJA, 53, 'S5', 16, { color: PAL.negro, bold: true, origin: [0.5, 0.5] }));

    SECTOR_IDS.forEach((id, i) => {
      // Nube: el entorno de cada operación.
      g.fillStyle(PAL.azul, 0.55);
      g.fillEllipse(X_NUBE, y(i), 62, 46);
      g.fillEllipse(X_NUBE - 14, y(i) + 8, 40, 30);
      g.fillEllipse(X_NUBE + 12, y(i) - 8, 40, 30);
      g.lineStyle(4, PAL.naranjo);
      g.lineBetween(X_NUBE + 28, y(i) - 6, X_CIRC, y(i) - 6);
      g.lineBetween(X_NUBE + 28, y(i) + 6, X_CIRC, y(i) + 6);
      g.lineBetween(X_CIRC, y(i) - 6, X_CAJA, y(i) - 6);
      g.lineBetween(X_CIRC, y(i) + 6, X_CAJA, y(i) + 6);
      g.lineStyle(4, PAL.azul);
      g.lineBetween(X_CAJA, y(i), X_TRI, y(i));
      g.fillStyle(PAL.blanco);
      g.fillCircle(X_CIRC, y(i), 25);
      g.lineStyle(3, PAL.blanco);
      g.strokeTriangle(X_TRI, y(i) + 12, X_TRI + 28, y(i) + 12, X_TRI + 14, y(i) - 14);
      parent.add(vtext(scene, X_NUBE, y(i), String.fromCharCode(65 + i), 20, { color: PAL.negro, bold: true, origin: [0.5, 0.5] }));
      parent.add(vtext(scene, X_CIRC, y(i), t(`sector.corto.${id}`), 11, { color: PAL.negro, bold: true, origin: [0.5, 0.5] }));
      const v = vtext(scene, X_CAJA + CAJA / 2 + 4, y(i) + 9, '', 12, { color: PAL.gris });
      this.valores.push(v);
      parent.add(v);
    });
    this.dyn = scene.add.graphics();
    parent.add(this.dyn);
  }

  refresh(): void {
    const { state: s, ctx } = this.session;
    const g = this.dyn;
    g.clear();
    const y = (i: number): number => ROW0 + i * ROW_H;
    const caja = (cx: number, cy: number, nivel: number, meta: number): void => {
      const x0 = cx - CAJA / 2, y0 = cy - CAJA / 2;
      g.fillStyle(PAL.blanco);
      g.fillRect(x0, y0, CAJA, CAJA);
      const h = Math.round(Phaser.Math.Clamp(nivel, 0, 1) * (CAJA - 4));
      g.fillStyle(PAL.azul);
      g.fillRect(x0 + 2, y0 + CAJA - 2 - h, CAJA - 4, h);
      // Banda roja: la meta fijada por la sala.
      g.fillStyle(PAL.rojo);
      g.fillRect(x0 + 2, y0 + CAJA - 2 - Math.round(Phaser.Math.Clamp(meta, 0, 1) * (CAJA - 4)), CAJA - 4, 3);
    };
    SECTOR_IDS.forEach((id, i) => {
      const util = report(s, ctx, `sector:${id}`, 'utilizacion').valor;
      caja(X_CAJA, y(i), util, ctx.bal.inicio.utilizacionBase * s.levers.metas[id]);
      this.valores[i]!.setText(`${Math.round(util * 100)}`);
      // Flecha hacia arriba: se enciende cuando el sector pide ayuda (señal algedónica).
      const st = estadoSector(s, ctx, id);
      const color = st.senal === 2 ? PAL.rojo : st.senal === 1 ? PAL.mostaza : PAL.carbon;
      g.fillStyle(color);
      const ay = y(i) - CAJA / 2 - 9;
      g.fillRect(X_CAJA - 3, ay, 6, 9);
      g.fillTriangle(X_CAJA - 8, ay, X_CAJA + 8, ay, X_CAJA, ay - 8);
    });
    caja(X_CAJA, 120, report(s, ctx, 'pais', 'produccion').valor / 100, ctx.bal.inicio.utilizacionBase);
  }
}
