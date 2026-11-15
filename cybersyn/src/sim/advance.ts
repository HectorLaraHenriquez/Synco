/** Avance mutable del estado. engine.ts y checo.ts lo envuelven (clonan antes). */
import { SECTOR_IDS, ZONE_IDS } from '../data/schemas';
import { spawnCheck, tickSignals } from './algedonic';
import { bus } from './bus';
import { clamp, type Ctx } from './ctx';
import { alertasDelDia } from './cyberstride';
import { generarVoces, updateAnimo, updateMoral } from './cyberfolk';
import { calidadVida, computeIndicators, computeProduction, computeZones, dailyEconomy, salarioRealIdx, stepEconomy } from './economy';
import { processDue } from './effects';
import { recordDay } from './observe';
import type { Rng } from './rng';
import type { DaySnapshot, GameState, SectorId, ZoneId } from './state';

const EPS = 1e-9;

export const finDeJornada = (ctx: Ctx): number => ctx.bal.tiempo.horaInicio + ctx.bal.tiempo.horasPorDia;

/** Avanza el reloj dtHours (acotado al fin de la jornada). */
export function stepMut(s: GameState, ctx: Ctx, rng: Rng, dtHours: number): void {
  const hpd = ctx.bal.tiempo.horasPorDia;
  let left = Math.min(dtHours, finDeJornada(ctx) - s.hour);
  while (left > EPS) {
    const nextInt = Math.floor(s.hour + EPS) + 1;
    const chunk = Math.min(left, nextInt - s.hour);
    stepEconomy(s, ctx, chunk / hpd);
    if (!ctx.checo) tickSignals(s, ctx, chunk * 60);
    s.hour += chunk;
    left -= chunk;
    if (Math.abs(s.hour - Math.round(s.hour)) < EPS) {
      s.hour = Math.round(s.hour);
      if (!ctx.checo) spawnCheck(s, ctx, rng);
    }
  }
  s.indicators = computeIndicators(s, ctx);
}

function dailyPolitics(s: GameState, ctx: Ctx): void {
  const p = ctx.bal.politica;
  const i = s.indicators;
  let cap = p.capitalBase;
  if (i.abastecimiento >= p.umbralAbastAlto) cap += p.capitalAbastAlto;
  if (i.animo >= p.umbralAnimoAlto) cap += p.capitalAnimoAlto;
  if (i.abastecimiento < p.umbralAbastBajo) cap += p.capitalAbastBajo;
  s.player.capitalPolitico = clamp(s.player.capitalPolitico + cap, 0, p.capitalMax);

  let conf = 0;
  if (i.abastecimiento < p.umbralAbastBajo) conf += p.confianzaAbastBajo;
  if (i.animo < p.umbralAnimoBajo) conf += p.confianzaAnimoBajo;
  if (conf === 0) conf = p.confianzaBien;
  s.player.confianza = clamp(s.player.confianza + conf, 0, 100);

  let aut = p.autoritarismoFiscalizacion[s.levers.fiscalizacion];
  for (const id of SECTOR_IDS) aut += ctx.bal.autonomia[s.sectors[id].autonomia].autoritarismoDia;
  s.hidden.autoritarismo = clamp(s.hidden.autoritarismo + aut, 0, 100);
}

function snapshot(s: GameState): DaySnapshot {
  const produccion = {} as Record<SectorId, number>;
  for (const id of SECTOR_IDS) produccion[id] = s.sectors[id].produccion;
  const animo = {} as Record<ZoneId, number>;
  for (const z of ZONE_IDS) animo[z] = s.zones[z].animo;
  const e = s.economy;
  return {
    day: s.day, indicators: { ...s.indicators }, calidadVida: calidadVida(s), ipc: e.ipc,
    inflacionMensual: e.inflacionMensual, divisas: e.divisas, precioCobre: e.precioCobre,
    mercadoNegro: e.mercadoNegro, brecha: e.brecha, salarioRealIdx: salarioRealIdx(s), produccion, animo,
    voces: [], alertas: [],
  };
}

/** "Checo dijo": la corrida más antigua (mayor anticipación) que pronosticó el día de hoy. */
function checoDijo(s: GameState): DaySnapshot['checo'] {
  for (const run of s.checo) {
    const idx = run.dias.indexOf(s.day);
    if (run.dia < s.day && idx >= 0) {
      const serie = run.adoptado ? run.escenario : run.base;
      return { hechoElDia: run.dia, dijo: serie.indicadores[idx]! };
    }
  }
  return undefined;
}

function checkEnding(s: GameState, ctx: Ctx): void {
  const c = ctx.bal.colapso;
  const i = s.indicators;
  const bump = (key: string, cond: boolean): number => {
    const n = cond ? ((s.flags[key] as number) ?? 0) + 1 : 0;
    s.flags[key] = n;
    return n;
  };
  const nProd = bump('cnt_produccion', i.produccion < c.produccionMin);
  const nAbast = bump('cnt_abastecimiento', i.abastecimiento < c.abastecimientoMin);
  const nDiv = bump('cnt_divisas', s.economy.divisas < 0.5);
  if (s.player.confianza <= 0) s.ending = { id: 'DESPIDO', reason: 'confianza', day: s.day };
  else if (nAbast >= c.abastecimientoDias) s.ending = { id: 'COLAPSO', reason: 'abastecimiento', day: s.day };
  else if (nDiv >= c.divisasDias) s.ending = { id: 'COLAPSO', reason: 'cesacion_de_pagos', day: s.day };
  else if (nProd >= c.produccionDias) s.ending = { id: 'COLAPSO', reason: 'produccion', day: s.day };
  else if (i.animo < c.animoMin) s.ending = { id: 'COLAPSO', reason: 'estallido', day: s.day };
  if (s.ending) bus.emit('ending', { ...s.ending });
}

/** Cierra el día y abre el siguiente. Devuelve la foto del día cerrado. */
export function endDayMut(s: GameState, ctx: Ctx, rng: Rng): DaySnapshot {
  dailyEconomy(s, ctx, rng);
  updateAnimo(s, ctx, rng);
  updateMoral(s, ctx);
  computeProduction(s, ctx);
  computeZones(s, ctx);
  s.indicators = computeIndicators(s, ctx);
  if (!ctx.checo) {
    dailyPolitics(s, ctx);
    recordDay(s, ctx);
    s.alerts = alertasDelDia(s, ctx);
  }
  const snap = snapshot(s);
  if (!ctx.checo) {
    snap.voces = generarVoces(s, ctx, rng);
    snap.alertas = s.alerts;
    snap.checo = checoDijo(s);
    s.history.push(snap);
    checkEnding(s, ctx);
  }
  s.day += 1;
  s.hour = ctx.bal.tiempo.horaInicio;
  s.act = s.day <= 10 ? 1 : s.day <= 20 ? 2 : s.day <= 25 ? 3 : 'CLIMAX';
  s.player.ciclosUsados = 0;
  s.flags.alg_hoy = 0;
  processDue(s, ctx);
  s.indicators = computeIndicators(s, ctx);
  if (!ctx.checo) bus.emit('dayEnded', { day: snap.day });
  return snap;
}
