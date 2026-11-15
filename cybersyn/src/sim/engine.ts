/** Motor: funciones puras sobre GameState (clonan y devuelven un estado nuevo). */
import { SECTOR_IDS, ZONE_IDS, type GameData } from '../data/schemas';
import { bus } from './bus';
import {
  calidadVida, clamp, computeIndicators, computeProduction, dailyUpdate, makeCtx,
  refreshSectorBasics, salarioRealIdx, stepEconomy, type Ctx,
} from './economy';
import { Rng, hashSeed } from './rng';
import {
  STATE_VERSION, type DaySnapshot, type Difficulty, type FactionId, type FirmState, type GameState,
  type LeverPatch, type PriceCat, type SectorId, type SectorState, type ZoneId, type ZoneState,
} from './state';

const FACTIONS: FactionId[] = ['cordones', 'gobierno', 'gremios', 'ffaaConstitucionalistas', 'ffaaGolpistas', 'intelectuales', 'norte'];

export interface Engine {
  data: GameData;
  init(seed: string, difficulty?: Difficulty): GameState;
  tick(state: GameState, dtHours?: number): GameState;
  endDay(state: GameState): GameState;
  runDay(state: GameState): GameState;
  setLevers(state: GameState, patch: LeverPatch): GameState;
  adjustPrices(state: GameState, cat: PriceCat, pct: number): GameState;
  isOver(state: GameState): boolean;
}

export function createEngine(data: GameData): Engine {
  const ctx = makeCtx(data);
  const { balance: bal } = data;
  const hpd = bal.tiempo.horasPorDia;

  const clone = (s: GameState): GameState => structuredClone(s);

  function init(seed: string, difficulty: Difficulty = 'NORMAL'): GameState {
    const ini = bal.inicio;
    const sectors = {} as Record<SectorId, SectorState>;
    const firms: Record<string, FirmState> = {};
    for (const f of data.firms) {
      firms[f.id] = {
        id: f.id, nombre: f.nombre, sector: f.sector, rama: f.rama, zona: f.zona,
        capacidad: f.capacidad, produccion: 0, reportado: 0, reportLagDays: 0,
        autonomia: f.autonomia, conectada: true, nodoRed: `nodo_${f.zona}`,
      };
    }
    for (const id of SECTOR_IDS) {
      const cap = data.firms.filter((f) => f.sector === id).reduce((a, f) => a + f.capacidad, 0);
      sectors[id] = {
        capacidad: cap, capacidadBase: cap, utilizacion: 0, insumos: 0, requeridoDia: 0, factorInsumos: 1,
        moral: ctx.sec[id].moralInicial, meta: 1, autonomia: 'COORDINADO', sabotaje: 0, produccion: 0, reportado: 0,
      };
    }
    const zones = {} as Record<ZoneId, ZoneState>;
    for (const z of ZONE_IDS) zones[z] = { animo: ini.animo, abastecimiento: 0, propaganda: 0, cultura: 0, control: 'LEAL' };
    const metas = {} as Record<SectorId, number>;
    for (const id of SECTOR_IDS) metas[id] = 1;

    const s: GameState = {
      version: STATE_VERSION, seed, rng: hashSeed(seed), day: 1, hour: bal.tiempo.horaInicio, act: 1, difficulty,
      economy: {
        divisas: ini.divisas, precioCobre: ini.precioCobre, ipc: ini.ipc, inflacionMensual: 0, salarioNominal: 0,
        salarioBase: 0, empleo: ini.empleo, precioOficial: { BASICOS: 1, MANUFACTURAS: 1, SERVICIOS: 1 },
        ajustePrecios: 0, mercadoNegro: ini.mercadoNegro, deudaExterna: ini.deudaExterna, precioImportIdx: 1,
        brecha: 0, abastecimiento: 0, ofertaBasicos: 0, demandaBasicos: 0, ingresosDivisas: 0,
        soberaniaCultural: ini.soberaniaCultural,
        capacidadBaseTotal: SECTOR_IDS.reduce((a, id) => a + sectors[id].capacidad, 0),
      },
      sectors, firms, zones,
      indicators: { produccion: 0, abastecimiento: 0, estabilidadPrecios: 0, divisas: 0, estabilidadRed: 100, animo: 0, soberania: 0 },
      hidden: { autoritarismo: ini.autoritarismo, hostilidadNorte: ini.hostilidadNorte },
      player: { confianza: ini.confianza, capitalPolitico: ini.capitalPolitico, ciclosComputo: ini.ciclosComputo, slotsAtencion: ini.slotsAtencion },
      factions: Object.fromEntries(FACTIONS.map((f) => [f, 50])) as Record<FactionId, number>,
      levers: {
        metas, asignacionDivisas: { ...ini.asignacionDivisas } as Record<SectorId, number>,
        emision: 'MEDIO', fiscalizacion: 'OFF', shareExportCobre: bal.economia.shareExportCobre,
      },
      draftLevers: {}, algedonic: [], telexQueue: [], sabotageOps: [],
      tech: { unlocked: [] }, flags: {}, history: [], pendingEffects: [], log: [],
    };

    // Estado inicial en equilibrio: stock de insumos, producción y salario calibrado a la brecha inicial.
    refreshSectorBasics(s, ctx);
    for (const id of SECTOR_IDS) s.sectors[id].insumos = ini.stockDiasInsumos * s.sectors[id].requeridoDia;
    computeProduction(s, ctx);
    const oferta0 = s.sectors.CON.produccion + s.sectors.AGR.produccion + bal.economia.importAlimentosUnidades;
    s.economy.salarioNominal = (oferta0 * (1 + ini.brechaInicial) * s.economy.precioOficial.BASICOS) / s.economy.empleo;
    s.economy.salarioBase = s.economy.salarioNominal / s.economy.ipc;
    s.economy.ofertaBasicos = oferta0;
    s.economy.demandaBasicos = oferta0 * (1 + ini.brechaInicial);
    s.economy.brecha = ini.brechaInicial;
    s.economy.abastecimiento = clamp((100 * oferta0 * (1 - ini.mercadoNegro)) / s.economy.demandaBasicos, 0, 100);
    s.economy.ingresosDivisas = s.sectors.MIN.produccion * s.levers.shareExportCobre * s.economy.precioCobre * bal.economia.kCobre;
    for (const z of ZONE_IDS) s.zones[z].abastecimiento = clamp(s.economy.abastecimiento * ctx.zone[z].acceso, 0, 100);
    s.indicators = computeIndicators(s, ctx);
    return s;
  }

  function tick(prev: GameState, dtHours = 1): GameState {
    if (isOver(prev)) return prev;
    const s = clone(prev);
    stepEconomy(s, ctx, dtHours / hpd);
    s.hour += dtHours;
    s.indicators = computeIndicators(s, ctx);
    bus.emit('tick', { day: s.day, hour: s.hour });
    return s;
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
    };
  }

  function checkCollapse(s: GameState): void {
    const c = bal.colapso;
    const i = s.indicators;
    const bump = (key: string, cond: boolean): number => {
      const n = cond ? ((s.flags[key] as number) ?? 0) + 1 : 0;
      s.flags[key] = n;
      return n;
    };
    const nProd = bump('cnt_produccion', i.produccion < c.produccionMin);
    const nAbast = bump('cnt_abastecimiento', i.abastecimiento < c.abastecimientoMin);
    const nDiv = bump('cnt_divisas', s.economy.divisas < 0.5);
    let reason: string | undefined;
    if (nAbast >= c.abastecimientoDias) reason = 'abastecimiento';
    else if (nDiv >= c.divisasDias) reason = 'cesacion_de_pagos';
    else if (nProd >= c.produccionDias) reason = 'produccion';
    else if (i.animo < c.animoMin) reason = 'estallido';
    if (reason) {
      s.ending = { id: 'COLAPSO', reason, day: s.day };
      bus.emit('ending', { ...s.ending });
    }
  }

  function endDay(prev: GameState): GameState {
    if (isOver(prev)) return prev;
    const s = clone(prev);
    const rng = new Rng(s.rng);
    dailyUpdate(s, ctx, rng);
    s.rng = rng.s;
    computeProduction(s, ctx);
    s.indicators = computeIndicators(s, ctx);
    s.history.push(snapshot(s));
    checkCollapse(s);
    const closed = s.day;
    s.day += 1;
    s.hour = bal.tiempo.horaInicio;
    s.act = s.day <= 10 ? 1 : s.day <= 20 ? 2 : s.day <= 25 ? 3 : 'CLIMAX';
    bus.emit('dayEnded', { day: closed });
    return s;
  }

  function runDay(prev: GameState): GameState {
    let s = prev;
    for (let h = 0; h < hpd; h++) s = tick(s, 1);
    return endDay(s);
  }

  function setLevers(prev: GameState, patch: LeverPatch): GameState {
    const s = clone(prev);
    const { metaMin, metaMax } = bal.limites;
    for (const id of SECTOR_IDS) {
      const m = patch.metas?.[id];
      if (m !== undefined) s.levers.metas[id] = clamp(m, metaMin, metaMax);
    }
    if (patch.asignacionDivisas) {
      const raw: Record<SectorId, number> = { ...s.levers.asignacionDivisas, ...patch.asignacionDivisas };
      const tot = SECTOR_IDS.reduce((a, id) => a + Math.max(0, raw[id]), 0);
      if (tot <= 0) throw new Error('asignacionDivisas debe sumar > 0');
      for (const id of SECTOR_IDS) s.levers.asignacionDivisas[id] = Math.max(0, raw[id]) / tot;
    }
    if (patch.emision) s.levers.emision = patch.emision;
    if (patch.fiscalizacion) s.levers.fiscalizacion = patch.fiscalizacion;
    if (patch.shareExportCobre !== undefined) s.levers.shareExportCobre = clamp(patch.shareExportCobre, 0, 1);
    refreshSectorBasics(s, ctx);
    return s;
  }

  function adjustPrices(prev: GameState, cat: PriceCat, pct: number): GameState {
    const s = clone(prev);
    const p = clamp(pct, -bal.limites.precioMaxCambio, bal.limites.precioMaxCambio);
    s.economy.precioOficial[cat] *= 1 + p;
    s.economy.ajustePrecios += p * bal.economia.pesoCategoria[cat];
    return s;
  }

  function isOver(s: GameState): boolean {
    return s.ending !== undefined || s.day > bal.tiempo.diasCampana;
  }

  return { data, init, tick, endDay, runDay, setLevers, adjustPrices, isOver };
}
