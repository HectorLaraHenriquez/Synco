import type { Autonomy, Effect, LeverKey, SectorId, ZoneId } from '../data/schemas';
export type { Autonomy, Effect, LeverKey, SectorId, ZoneId };

export type PriceCat = 'BASICOS' | 'MANUFACTURAS' | 'SERVICIOS';
export const PRICE_CATS: PriceCat[] = ['BASICOS', 'MANUFACTURAS', 'SERVICIOS'];
export type Emision = 'BAJO' | 'MEDIO' | 'ALTO';
export type Fiscalizacion = 'OFF' | 'RACIONAMIENTO' | 'ESTRICTO';
export type Difficulty = 'HISTORIA' | 'NORMAL' | 'BEER';
export type Act = 1 | 2 | 3 | 'CLIMAX';
export type FactionId =
  | 'cordones' | 'gobierno' | 'gremios' | 'ffaaConstitucionalistas'
  | 'ffaaGolpistas' | 'intelectuales' | 'norte';
export const FACTION_IDS: FactionId[] = [
  'cordones', 'gobierno', 'gremios', 'ffaaConstitucionalistas', 'ffaaGolpistas', 'intelectuales', 'norte',
];

export const STATE_VERSION = 2;

/**
 * Palancas (GDD 3.4). `precios`, `reajusteSalarial` e `inversiones` son de un solo uso:
 * en el estado aplicado siempre valen 0 / [] y sólo tienen contenido en el borrador.
 */
export interface LeverState {
  precios: Record<PriceCat, number>;           // ajuste ±0–0.30 por categoría (0 = congelar)
  asignacionDivisas: Record<SectorId, number>; // suma 1
  metas: Record<SectorId, number>;             // 0.8–1.3
  reajusteSalarial: number;                    // 0–0.40
  emision: Emision;
  shareExportCobre: number;                    // 0–1 (resto se refina en Chile)
  zonasPrioritarias: ZoneId[];
  fiscalizacion: Fiscalizacion;
  inversiones: string[];                       // ramas 'CON.textil'
}
export const ONE_SHOT_LEVERS: LeverKey[] = ['precios', 'reajusteSalarial', 'inversiones'];

/** Parche parcial; los registros admiten sólo algunas claves. */
export type LeverPatch = Partial<Omit<LeverState, 'metas' | 'asignacionDivisas' | 'precios'>> & {
  precios?: Partial<LeverState['precios']>;
  metas?: Partial<LeverState['metas']>;
  asignacionDivisas?: Partial<LeverState['asignacionDivisas']>;
};

export interface EconomyState {
  divisas: number;            // MUSD
  precioCobre: number;        // USD/lb
  ipc: number;
  inflacionMensual: number;   // fracción
  salarioNominal: number;
  salarioBase: number;        // salario real inicial, referencia del índice
  empleo: number;             // 0–1
  precioOficial: Record<PriceCat, number>;
  ajustePrecios: number;      // pulso por cambios de precio, decae
  mercadoNegro: number;       // 0–1
  deudaExterna: number;
  precioImportIdx: number;    // deriva de precios de importación
  brecha: number;             // >0 = escasez
  abastecimiento: number;     // 0–100, base nacional antes de la distribución por zona
  ofertaBasicos: number;
  demandaBasicos: number;
  ingresosDivisas: number;    // MUSD/día
  refinacionMadurez: number;  // 0–1: valor agregado del cobre refinado en Chile
  soberaniaCultural: number;  // 0–100
  capacidadBaseTotal: number; // Σ capacidad inicial
}

export interface SectorState {
  capacidad: number;          // nominal = Σ empresas
  capacidadEfectiva: number;  // Σ capacidad·eficiencia
  utilizacion: number;
  insumos: number;
  requeridoDia: number;
  factorInsumos: number;
  moral: number;
  meta: number;
  autonomia: Autonomy;
  sabotaje: number;           // oculto
  produccion: number;         // REAL: la UI debe leerla vía report()
}

export interface FirmState {
  id: string; nombre: string; sector: SectorId; rama: string; zona: ZoneId;
  capacidad: number;
  eficiencia: number;         // 0–1 (averías)
  produccion: number;         // REAL
  reportLagDays: number;      // retraso propio (línea caída, etc.)
  autonomia: Autonomy; conectada: boolean; nodoRed: string;
}

export interface ZoneState {
  animo: number;
  abastecimiento: number;
  abastBonus: number;         // envíos extraordinarios; decae
  propaganda: number; cultura: number;
  control: 'LEAL' | 'GOLPISTA' | 'OCUPADA';
}

export interface NationalIndicators {
  produccion: number; abastecimiento: number; estabilidadPrecios: number; divisas: number;
  estabilidadRed: number; animo: number; soberania: number;
}
export const INDICATOR_KEYS: (keyof NationalIndicators)[] = [
  'produccion', 'abastecimiento', 'estabilidadPrecios', 'divisas', 'estabilidadRed', 'animo', 'soberania',
];

export type Cost = { divisas?: number; capitalPolitico?: number };

export interface AlgedonicSignal {
  id: string;
  templateId: string;
  origen: { tipo: 'FIRM' | 'ZONE' | 'SECTOR'; id: string };
  nivel: 1 | 2 | 3;
  causa: string;
  creadaDia: number;
  venceEnMin: number;
  atendida: boolean;
  opcionId?: string;          // opción elegida al atender
  resuelveEnMin?: number;     // minutos restantes hasta resolver (ocupa un slot)
  opciones: { id: string; texto: string; duraMin: number; efectos: Effect[]; costo?: Cost }[];
  alIgnorar: Effect[];
}

// --- Estructuras de módulos posteriores (H5+) ---
export interface Telex {
  id: string; tipo: 'PEDIDO' | 'INFO' | 'DIRECTIVA' | 'PERSONAL' | 'INTERCEPTADO';
  remitente: string; clave: string; cuerpo: string; hora: number;
  verdad: 'LEGITIMO' | 'SABOTAJE'; sabotageOpId?: string;
  acciones: ('APROBAR' | 'RECHAZAR' | 'DERIVAR' | 'SOSPECHOSO' | 'ARCHIVAR')[];
  efectos: Partial<Record<string, Effect[]>>;
}
export interface SabotageOperation { id: string; opId: string; startDay: number; step: number; detections: number; active: boolean }

export type EffectOrigin = 'JUGADOR' | 'EVENTO' | 'SABOTAJE';
export interface DelayedEffect { dueDay: number; effects: Effect[]; origen: EffectOrigin }
export interface LogEntry { day: number; hour: number; code: string; data?: Record<string, string | number> }

/** Falsificación de datos reportados (la usa el sabotaje en H6; ya afecta a report() y Checo). */
export interface Falsification {
  target: string;             // 'rama:CON.textil' | 'firm:id' | 'zone:BIO'
  indicador: string;          // 'produccion' | 'animo' | 'abastecimiento'
  factor: number;             // multiplicativo
  offset: number;             // aditivo
  hastaDia: number;           // inclusive
}

export interface StrideAlert {
  day: number; serie: string; tipo: 'DESVIO' | 'TENDENCIA';
  valor: number; esperado: number; direccion: 'SUBE' | 'BAJA';
}

export interface ChecoSerie { indicadores: NationalIndicators[]; inflacion: number[]; divisas: number[] }
export interface ChecoRun {
  dia: number; hora: number; horizonte: 7 | 30;
  dias: number[];             // día de juego de cada punto (fin de día)
  base: ChecoSerie;           // palancas actuales
  escenario: ChecoSerie;      // con el borrador aplicado
  bandaPct: number[];         // abanico de error por punto
  draft: LeverPatch;
  adoptado: boolean;          // el jugador ejecutó ese borrador
}

export interface Voz { zona: ZoneId; tono: 'NEG' | 'POS'; texto: string }

export interface DaySnapshot {
  day: number;
  indicators: NationalIndicators;   // reales (el cierre revela el resultado)
  calidadVida: number;
  ipc: number; inflacionMensual: number; divisas: number; precioCobre: number;
  mercadoNegro: number; brecha: number; salarioRealIdx: number;
  produccion: Record<SectorId, number>;
  animo: Record<ZoneId, number>;
  voces: Voz[];
  alertas: StrideAlert[];
  checo?: { hechoElDia: number; dijo: NationalIndicators }; // "Checo dijo / pasó"
}

export interface Ending { id: 'COLAPSO' | 'DESPIDO'; reason: string; day: number }

export interface GameState {
  version: number;
  seed: string;
  rng: number;                 // estado del RNG (uint32)
  nextId: number;
  day: number;                 // 1..30 (31 = campaña terminada)
  hour: number;                // 8..20, fraccionaria (minutos)
  act: Act;
  climax?: 'INTERVENCION_MILITAR' | 'INVASION_EXTRANJERA';
  difficulty: Difficulty;
  economy: EconomyState;
  sectors: Record<SectorId, SectorState>;
  firms: Record<string, FirmState>;
  zones: Record<ZoneId, ZoneState>;
  indicators: NationalIndicators;   // REALES
  hidden: { autoritarismo: number; hostilidadNorte: number };
  player: {
    confianza: number; capitalPolitico: number;
    ciclosComputo: number;     // capacidad diaria
    ciclosUsados: number;
    slotsAtencion: number;
  };
  factions: Record<FactionId, number>;
  levers: LeverState;
  draftLevers: LeverPatch;
  algedonic: AlgedonicSignal[];
  algCooldown: Record<string, number>;   // 'template|origen' → día desde el que puede reaparecer
  telexQueue: Telex[];
  sabotageOps: SabotageOperation[];
  falsificaciones: Falsification[];
  investigaciones: Record<string, number>; // nodeId → hasta qué día (inclusive) se ve el dato real
  series: Record<string, number[]>;        // datos REPORTADOS por día (índice = día−1)
  alerts: StrideAlert[];
  checo: ChecoRun[];
  checoSesgo: Record<string, number>;      // error estructural del modelo Checo (multiplicadores)
  tech: { unlocked: string[]; researching?: { id: string; daysLeft: number } };
  flags: Record<string, boolean | number | string>;
  history: DaySnapshot[];
  pendingEffects: DelayedEffect[];
  log: LogEntry[];
  ending?: Ending;
}
