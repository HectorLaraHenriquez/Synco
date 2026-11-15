import { pantallaDesbloqueada } from '../../sim/observe';
import { INDICATOR_KEYS } from '../../sim/state';
import { t } from '../i18n';
import { PAL } from '../palette';
import { Button } from '../widgets/Button';
import { fmt, pad, Panel } from './Panel';

/** Panel 3: simular el borrador antes de aplicarlo (H4: gráfico con abanico de error). */
export class ChecoPanel extends Panel {
  readonly id = 'checo';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    if (!pantallaDesbloqueada(s, ctx, 'checo')) {
      this.line(0, 1, t('panel.bloqueado', { dia: ctx.bal.pantallas.desbloqueoDia.checo }), PAL.gris);
      return;
    }
    const libres = s.player.ciclosComputo - s.player.ciclosUsados;
    this.line(0, 0, t('panel.checo.ciclos', { n: libres, max: s.player.ciclosComputo }), PAL.gris);
    const costo = ctx.bal.checo.costoHoras;
    this.put(new Button(this.scene, this.cx(0), this.ry(1) + 1, t('panel.checo.correr', { dias: 7, horas: costo['7'] }), () => this.session.dispatch({ t: 'RUN_CHECO', horizonDays: 7 }), { bg: PAL.azul }));
    this.put(new Button(this.scene, this.cx(26), this.ry(1) + 1, t('panel.checo.correr', { dias: 30, horas: costo['30'] }), () => this.session.dispatch({ t: 'RUN_CHECO', horizonDays: 30 }), { bg: PAL.azul }));

    const run = s.checo[s.checo.length - 1];
    if (!run) {
      this.line(0, 4, t('panel.checo.sinCorridas'), PAL.gris);
      return;
    }
    const k = run.horizonte;
    this.line(0, 4, t('panel.checo.resultado', { dia: run.dia, objetivo: run.dias[k]!, banda: fmt(run.bandaPct[k]! * 100) }), PAL.gris);
    this.line(0, 5, t('panel.checo.cabecera'), PAL.gris);
    INDICATOR_KEYS.forEach((key, i) => {
      const base = run.base.indicadores[k]![key], esc = run.escenario.indicadores[k]![key];
      const d = esc - base;
      const color = Math.abs(d) < 0.5 ? PAL.verde_crt : d > 0 ? PAL.blanco : PAL.mostaza;
      this.line(0, 6 + i, `${t(`ind.${key}`).padEnd(24)}${pad(fmt(base), 8)}${pad(fmt(esc), 12)}${pad((d >= 0 ? '+' : '') + fmt(d), 8)}`, color);
    });
    this.line(0, 13, t(run.adoptado ? 'panel.checo.adoptado' : 'panel.checo.noAdoptado'), PAL.gris);
  }
}
