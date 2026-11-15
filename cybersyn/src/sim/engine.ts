/** Motor: funciones puras sobre GameState (clonan y devuelven un estado nuevo). */
import { SECTOR_IDS, ZONE_IDS, type GameData } from '../data/schemas';
import { endDayMut, finDeJornada, stepMut } from './advance';
import { bus } from './bus';
import { initSesgo } from './checo';
import { execCommand, type Command } from './commands';
import { clamp, makeCtx, type Ctx } from './ctx';
import { computeIndicators, computeProduction, refreshSectorBasics, stepEconomy } from './economy';
import { forceApply } from './levers';
import { Rng, hashSeed } from './rng';
import {
  FACTION_IDS, STATE_VERSION, type Difficulty, type FactionId, type FirmState, type GameState,
  type LeverPatch, type SectorId, type SectorState, type ZoneId, type ZoneState,
} from './state';

export type CommandResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };

export interface Engine {
  data: GameData;
  ctx: Ctx;
  init(seed: string, difficulty?: Difficulty): GameState;
  /** Avanza el reloj (por defecto 1 h de juego). */
  tick(state: GameState, dtHours?: number): GameState;
  /** Cierre del día: actualizaciones diarias, archivo, alertas, finales; abre el día siguiente. */
  endDay(state: GameState): GameState;
  /** Resto de la jornada + cierre. */
  runDay(state: GameState): GameState;
  /** Devuelve el estado nuevo, o el mismo si el comando se rechaza (emite 'commandRejected'). */
  applyCommand(state: GameState, cmd: Command): GameState;
  tryCommand(state: GameState, cmd: Command): CommandResult;
  /** Sólo tests/herramientas: aplica palancas ya, sin desbloqueos, costos ni retrasos. */
  forceLevers(state: GameState, patch: LeverPatch): GameState;
  isOver(state: GameState): boolean;
}

export function createEngine(data: GameData): Engine {
  const ctx = makeCtx(data);
  const bal = data.balance;
  const clone = (s: GameState): GameState => structuredClone(s);
  const isOver = (s: GameState): boolean => s.ending !== undefined || s.day > bal.tiempo.diasCampana;

  /** Clona, ejecuta `fn` con el RNG del estado y guarda el RNG avanzado. */
  const mutate = (prev: GameState, fn: (s: GameState, rng: Rng) => void): GameState => {
    const s = clone(prev);
    const rng = new Rng(s.rng);
    fn(s, rng);
    s.rng = rng.s;
    return s;
  };

  function init(seed: string, difficulty: Difficulty = 'NORMAL'): GameState {
    const ini = bal.inicio;
    const rng = new Rng(hashSeed(seed));
    const sectors = {} as Record<SectorId, SectorState>;
    const firms: Record<string, FirmState> = {};
    for (const f of data.firms) {
      firms[f.id] = {
        id: f.id, nombre: f.nombre, sector: f.sector, rama: f.rama, zona: f.zona, capacidad: f.capacidad,
        eficiencia: 1, produccion: 0, reportLagDays: 0, autonomia: f.autonomia, conectada: true, nodoRed: `nodo_${f.zona}`,
      };
    }
    for (const id of SECTOR_IDS) {
      sectors[id] = {
        capacidad: 0, capacidadEfectiva: 0, utilizacion: 0, insumos: 0, requeridoDia: 0, factorInsumos: 1,
        moral: ctx.sec[id].moralInicial, meta: 1, autonomia: 'COORDINADO', sabotaje: 0, produccion: 0,
      };
    }
    const zones = {} as Record<ZoneId, ZoneState>;
    for (const z of ZONE_IDS) zones[z] = { animo: ini.animo, abastecimiento: 0, abastBonus: 0, propaganda: 0, cultura: 0, control: 'LEAL' };
    const metas = {} as Record<SectorId, number>;
    for (const id of SECTOR_IDS) metas[id] = 1;

    const s: GameState = {
      version: STATE_VERSION, seed, rng: 0, nextId: 1, day: 1, hour: bal.tiempo.horaInicio, act: 1, difficulty,
      economy: {
        divisas: ini.divisas, precioCobre: ini.precioCobre, ipc: ini.ipc, inflacionMensual: 0, salarioNominal: 0,
        salarioBase: 0, empleo: ini.empleo, precioOficial: { BASICOS: 1, MANUFACTURAS: 1, SERVICIOS: 1 },
        ajustePrecios: 0, mercadoNegro: ini.mercadoNegro, deudaExterna: ini.deudaExterna, precioImportIdx: 1,
        brecha: 0, abastecimiento: 0, ofertaBasicos: 0, demandaBasicos: 0, ingresosDivisas: 0, refinacionMadurez: 0,
        soberaniaCultural: ini.soberaniaCultural, capacidadBaseTotal: data.firms.reduce((a, f) => a + f.capacidad, 0),
      },
      sectors, firms, zones,
      indicators: { produccion: 0, abastecimiento: 0, estabilidadPrecios: 0, divisas: 0, estabilidadRed: 100, animo: 0, soberania: 0 },
      hidden: { autoritarismo: ini.autoritarismo, hostilidadNorte: ini.hostilidadNorte },
      player: {
        confianza: ini.confianza, capitalPolitico: ini.capitalPolitico, ciclosComputo: ini.ciclosComputo,
        ciclosUsados: 0, slotsAtencion: ini.slotsAtencion,
      },
      factions: Object.fromEntries(FACTION_IDS.map((f) => [f, 50])) as Record<FactionId, number>,
      levers: {
        precios: { BASICOS: 0, MANUFACTURAS: 0, SERVICIOS: 0 },
        asignacionDivisas: { ...ini.asignacionDivisas } as Record<SectorId, number>,
        metas, reajusteSalarial: 0, emision: 'MEDIO', shareExportCobre: bal.economia.shareExportCobre,
        zonasPrioritarias: [], fiscalizacion: 'OFF', inversiones: [],
      },
      draftLevers: {}, algedonic: [], algCooldown: {}, telexQueue: [], sabotageOps: [], falsificaciones: [],
      investigaciones: {}, series: {}, alerts: [], checo: [], checoSesgo: initSesgo(rng, bal, difficulty),
      tech: { unlocked: [] }, flags: { alg_hoy: 0 }, history: [], pendingEffects: [], log: [],
    };
    s.rng = rng.s;

    // Estado inicial en equilibrio: stock de insumos, producción y salario calibrado a la brecha inicial.
    const e = s.economy;
    refreshSectorBasics(s, ctx);
    for (const id of SECTOR_IDS) s.sectors[id].insumos = ini.stockDiasInsumos * s.sectors[id].requeridoDia;
    computeProduction(s, ctx);
    e.ofertaBasicos = s.sectors.CON.produccion + s.sectors.AGR.produccion + bal.economia.importAlimentosUnidades;
    e.demandaBasicos = e.ofertaBasicos * (1 + ini.brechaInicial);
    e.brecha = ini.brechaInicial;
    e.salarioNominal = (e.demandaBasicos * e.precioOficial.BASICOS) / e.empleo;
    e.salarioBase = e.salarioNominal / e.ipc;
    e.abastecimiento = clamp((100 * e.ofertaBasicos * (1 - ini.mercadoNegro)) / e.demandaBasicos, 0, 100);
    const share = s.levers.shareExportCobre;
    e.ingresosDivisas = s.sectors.MIN.produccion * e.precioCobre * bal.economia.kCobre * (share + (1 - share) * bal.cobre.refinadoValorInicial);
    stepEconomy(s, ctx, 0); // fija inflación y demás derivados sin avanzar el tiempo
    s.indicators = computeIndicators(s, ctx);
    return s;
  }

  function tick(prev: GameState, dtHours = 1): GameState {
    if (isOver(prev)) return prev;
    const s = mutate(prev, (st, rng) => stepMut(st, ctx, rng, dtHours));
    bus.emit('tick', { day: s.day, hour: s.hour });
    return s;
  }

  function endDay(prev: GameState): GameState {
    if (isOver(prev)) return prev;
    return mutate(prev, (s, rng) => void endDayMut(s, ctx, rng));
  }

  function runDay(prev: GameState): GameState {
    if (isOver(prev)) return prev;
    return mutate(prev, (s, rng) => {
      stepMut(s, ctx, rng, finDeJornada(ctx) - s.hour);
      endDayMut(s, ctx, rng);
    });
  }

  function tryCommand(prev: GameState, cmd: Command): CommandResult {
    if (isOver(prev)) return { ok: false, state: prev, error: 'JUEGO_TERMINADO' };
    let error: string | undefined;
    const s = mutate(prev, (st, rng) => {
      const r = execCommand(st, ctx, rng, cmd);
      error = r.error;
      if (!error && r.minutos) stepMut(st, ctx, rng, r.minutos / 60);
    });
    if (error) {
      bus.emit('commandRejected', { cmd: cmd.t, error });
      return { ok: false, state: prev, error };
    }
    return { ok: true, state: s };
  }

  const applyCommand = (prev: GameState, cmd: Command): GameState => tryCommand(prev, cmd).state;

  function forceLevers(prev: GameState, patch: LeverPatch): GameState {
    const s = clone(prev);
    forceApply(s, ctx, patch);
    return s;
  }

  return { data, ctx, init, tick, endDay, runDay, applyCommand, tryCommand, forceLevers, isOver };
}
