import type { Autonomy, SectorId, ZoneId } from '../data/schemas';
export type { Autonomy, SectorId, ZoneId };

export type PriceCat = 'BASICOS' | 'MANUFACTURAS' | 'SERVICIOS';
export type Emision = 'BAJO' | 'MEDIO' | 'ALTO';
export type Fiscalizacion = 'OFF' | 'RACIONAMIENTO' | 'ESTRICTO';
export type Difficulty = 'HISTORIA' | 'NORMAL' | 'BEER';
export type FactionId =
  | 'cordones' | 'gobierno' | 'gremios' | 'ffaaConstitucionalistas'
  | 'ffaaGolpistas' | 'intelectuales' | 'norte';

export const STATE_VERSION = 1;

/** Palancas aplicadas (H1: efecto inmediato; los retrasos llegan en H2). */
export interface LeverState {
  metas: Record<SectorId, number>;            // 0.8–1.3
  asignacionDivisas: Record<SectorId, number>; // suma 1
  emision: Emision;
  fiscalizacion: Fiscalizacion;
  shareExportCobre: number;                    // 0–1 (resto se refina en Chile)
}

/** Parche parcial de palancas; metas y asignación admiten sólo algunos sectores. */
export type LeverPatch = Partial<Omit<LeverState, 'metas' | 'asignacionDivisas'>> & {
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
  abastecimiento: number;     // 0–100
  ofertaBasicos: number;
  demandaBasicos: number;
  ingresosDivisas: number;    // MUSD/día
  soberaniaCultural: number;  // 0–100
  capacidadBaseTotal: number; // Σ capacidad inicial
}

export interface SectorState {
  capacidad: number;
  capacidadBase: number;
  utilizacion: number;
  insumos: number;
  requeridoDia: number;
  factorInsumos: number;
  moral: number;
  meta: number;
  autonomia: Autonomy;
  sabotaje: number;           // oculto
  produccion: number;         // real
  reportado: number;          // H2: report() lo distorsiona
}

export interface FirmState {
  id: string; nombre: string; sector: SectorId; rama: string; zona: ZoneId;
  capacidad: number; produccion: number; reportado: number; reportLagDays: number;
  autonomia: Autonomy; conectada: boolean; nodoRed: string;
}

export interface ZoneState {
  animo: number; abastecimiento: number; propaganda: number; cultura: number;
  control: 'LEAL' | 'GOLPISTA' | 'OCUPADA';
}

export interface NationalIndicators {
  produccion: number; abastecimiento: number; estabilidadPrecios: number; divisas: number;
  estabilidadRed: number; animo: number; soberania: number;
}

// --- Estructuras de módulos posteriores (H2+), definidas aquí para fijar el modelo de datos ---
export type Effect =
  | { op: 'add'; path: string; value: number }
  | { op: 'set'; path: string; value: unknown }
  | { op: 'delay'; days: number; effects: Effect[] }
  | { op: 'flag'; key: string; value: boolean | number | string }
  | { op: 'spawnTelex'; templateId: string }
  | { op: 'spawnAlgedonic'; templateId: string };

export interface AlgedonicSignal {
  id: string; origen: { tipo: 'FIRM' | 'ZONE' | 'SECTOR'; id: string };
  nivel: 1 | 2 | 3; causa: string; venceEnMin: number; atendida: boolean;
  opciones: { id: string; texto: string; efectos: Effect[]; costo?: Record<string, number> }[];
}
export interface Telex {
  id: string; tipo: 'PEDIDO' | 'INFO' | 'DIRECTIVA' | 'PERSONAL' | 'INTERCEPTADO';
  remitente: string; clave: string; cuerpo: string; hora: number;
  verdad: 'LEGITIMO' | 'SABOTAJE'; sabotageOpId?: string;
  acciones: ('APROBAR' | 'RECHAZAR' | 'DERIVAR' | 'SOSPECHOSO' | 'ARCHIVAR')[];
  efectos: Partial<Record<string, Effect[]>>;
}
export interface SabotageOperation { id: string; opId: string; startDay: number; step: number; detections: number; active: boolean }
export interface DelayedEffect { dueDay: number; effects: Effect[] }
export interface LogEntry { day: number; hour: number; text: string }

export interface DaySnapshot {
  day: number;
  indicators: NationalIndicators;
  calidadVida: number;
  ipc: number; inflacionMensual: number; divisas: number; precioCobre: number;
  mercadoNegro: number; brecha: number; salarioRealIdx: number;
  produccion: Record<SectorId, number>;
  animo: Record<ZoneId, number>;
}

export interface Ending { id: 'COLAPSO'; reason: string; day: number }

export interface GameState {
  version: number;
  seed: string;
  rng: number;                 // estado del RNG (uint32)
  day: number;                 // 1..30 (31 = campaña terminada)
  hour: number;                // 8..20
  act: 1 | 2 | 3 | 'CLIMAX';
  climax?: 'INTERVENCION_MILITAR' | 'INVASION_EXTRANJERA';
  difficulty: Difficulty;
  economy: EconomyState;
  sectors: Record<SectorId, SectorState>;
  firms: Record<string, FirmState>;
  zones: Record<ZoneId, ZoneState>;
  indicators: NationalIndicators;
  hidden: { autoritarismo: number; hostilidadNorte: number };
  player: { confianza: number; capitalPolitico: number; ciclosComputo: number; slotsAtencion: number };
  factions: Record<FactionId, number>;
  levers: LeverState;
  draftLevers: Partial<LeverState>;
  algedonic: AlgedonicSignal[];
  telexQueue: Telex[];
  sabotageOps: SabotageOperation[];
  tech: { unlocked: string[]; researching?: { id: string; daysLeft: number } };
  flags: Record<string, boolean | number | string>;
  history: DaySnapshot[];
  pendingEffects: DelayedEffect[];
  log: LogEntry[];
  ending?: Ending;
}
