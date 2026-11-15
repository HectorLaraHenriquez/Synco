import { t } from '../i18n';
import { nombreSerie } from '../labels';
import { PAL } from '../palette';
import { fmt, Panel } from './Panel';

/** Panel 2: alertas del último cierre (H4: series de 30 días con banda y pronóstico). */
export class CyberstridePanel extends Panel {
  readonly id = 'cyberstride';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    if (s.history.length === 0) {
      this.line(0, 1, t('panel.cyberstride.sinDatos'), PAL.gris);
      return;
    }
    this.line(0, 0, t('panel.cyberstride.cabecera', { dia: s.day - 1, n: s.alerts.length }), PAL.gris);
    if (s.alerts.length === 0) this.line(0, 2, t('panel.cyberstride.sinAlertas'));
    const max = 11;
    // Primero los desvíos (dato fuera de banda), después las tendencias.
    const orden = [...s.alerts].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'DESVIO' ? -1 : 1));
    orden.slice(0, max).forEach((a, i) => {
      const flecha = a.direccion === 'SUBE' ? '↑' : '↓';
      const color = a.tipo === 'DESVIO' ? PAL.mostaza : PAL.verde_crt;
      const nombre = nombreSerie(ctx, s, a.serie).slice(0, 38).padEnd(38);
      this.line(0, 2 + i, `${t(`alerta.${a.tipo}`)} ${flecha} ${nombre} ${fmt(a.valor, 1)}`, color);
    });
    if (orden.length > max) this.line(0, 2 + max, t('comun.mas', { n: orden.length - max }), PAL.gris);
  }
}
