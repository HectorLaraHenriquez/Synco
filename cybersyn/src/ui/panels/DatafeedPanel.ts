import { SECTOR_IDS } from '../../data/schemas';
import { report } from '../../sim/observe';
import { t } from '../i18n';
import { PAL } from '../palette';
import { fmt, pad, Panel } from './Panel';

/** Panel 1: indicadores por sector con semáforo (H4: navegación por el árbol VSM). */
export class DatafeedPanel extends Panel {
  readonly id = 'datafeed';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    this.line(0, 0, t('panel.datafeed.cabecera'), PAL.gris);
    SECTOR_IDS.forEach((id, i) => {
      const prod = report(s, ctx, `sector:${id}`, 'produccion');
      const util = report(s, ctx, `sector:${id}`, 'utilizacion').valor * 100;
      const ins = report(s, ctx, `sector:${id}`, 'insumosDias').valor;
      const moral = report(s, ctx, `sector:${id}`, 'moral').valor;
      const color = ins < 1 || moral < 40 ? PAL.rojo : ins < 2.5 || moral < 55 ? PAL.mostaza : PAL.verde_crt;
      const row = 2 + i * 2;
      this.put(this.scene.add.circle(this.cx(0) + 3, this.ry(row) + 3, 3, color));
      const edad = prod.edadDias > 0 ? t('dato.edad', { n: prod.edadDias }) : '';
      this.line(2, row, `${ctx.sec[id].nombre.padEnd(21)}${pad(fmt(prod.valor, 1), 7)}${pad(fmt(util), 6)}%${pad(fmt(ins, 1), 8)}${pad(fmt(moral), 7)} ${edad}`);
    });
    const ruido = report(s, ctx, 'sector:CON', 'produccion').ruidoPct * 100;
    this.line(0, 12, t('panel.datafeed.pie', { ruido: fmt(ruido) }), PAL.gris);
    this.line(0, 13, t('panel.datafeed.empresas', { n: Object.values(s.firms).filter((f) => f.conectada).length }), PAL.gris);
  }
}
