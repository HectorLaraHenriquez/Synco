import { z } from 'zod';

export const SECTOR_IDS = ['MIN', 'IND', 'CON', 'AGR', 'ENT'] as const;
export const ZONE_IDS = ['NG', 'NC', 'VAL', 'STGO', 'OM', 'BIO', 'ARL', 'AUS'] as const;
export const ACTS = ['1', '2', '3', 'CLIMAX'] as const;
export const LEVER_KEYS = [
  'precios', 'asignacionDivisas', 'metas', 'reajusteSalarial', 'emision',
  'shareExportCobre', 'zonasPrioritarias', 'fiscalizacion', 'inversiones',
] as const;
export type SectorId = (typeof SECTOR_IDS)[number];
export type ZoneId = (typeof ZONE_IDS)[number];
export type LeverKey = (typeof LEVER_KEYS)[number];

const n = z.number();
const sectorId = z.enum(SECTOR_IDS);
const zoneId = z.enum(ZONE_IDS);
const bySector = z.record(sectorId, n);
const byAct = z.record(z.enum(ACTS), n);
const byEmision = z.object({ BAJO: n, MEDIO: n, ALTO: n });
const byFisc = z.object({ OFF: n, RACIONAMIENTO: n, ESTRICTO: n });
const byLeverOrAutonomy = <T extends z.ZodType>(v: T) => z.record(z.enum([...LEVER_KEYS, 'autonomia']), v);

export const AutonomySchema = z.enum(['AUTOGESTION', 'COORDINADO', 'CENTRALIZADO']);
export type Autonomy = z.infer<typeof AutonomySchema>;
const autonomiaEfecto = z.object({ moralDia: n, prod: n, autoritarismoDia: n, lagDias: n });

// --- Efectos (GDD 7.4) ---
export type Effect =
  | { op: 'add'; path: string; value: number }
  | { op: 'mul'; path: string; value: number }
  | { op: 'set'; path: string; value: unknown }
  | { op: 'delay'; days: number; effects: Effect[] }
  | { op: 'flag'; key: string; value: boolean | number | string }
  | { op: 'spawnTelex'; templateId: string }
  | { op: 'spawnAlgedonic'; templateId: string };

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('add'), path: z.string(), value: n }),
    z.object({ op: z.literal('mul'), path: z.string(), value: n }),
    z.object({ op: z.literal('set'), path: z.string(), value: z.unknown() }),
    z.object({ op: z.literal('delay'), days: n.int().positive(), effects: z.array(EffectSchema) }),
    z.object({ op: z.literal('flag'), key: z.string(), value: z.union([z.boolean(), n, z.string()]) }),
    z.object({ op: z.literal('spawnTelex'), templateId: z.string() }),
    z.object({ op: z.literal('spawnAlgedonic'), templateId: z.string() }),
  ]),
) as z.ZodType<Effect>;

const CondSchema = z.object({ metric: z.string(), op: z.enum(['<', '>']), value: n });
export type Cond = z.infer<typeof CondSchema>;

export const BalanceSchema = z.object({
  version: n,
  tiempo: z.object({ horasPorDia: n, horaInicio: n, diasCampana: n, segundosPorHora: n }),
  pantallas: z.object({
    desbloqueoDia: z.object({ checo: n, red: n, cyberfolk: n }),
    cyberfolkPiloto: z.array(zoneId),
  }),
  inicio: z.object({
    divisas: n, precioCobre: n, ipc: n, empleo: n, mercadoNegro: n, deudaExterna: n, moral: n, animo: n,
    brechaInicial: n, utilizacionBase: n, soberaniaCultural: n, stockDiasInsumos: n, capitalPolitico: n,
    confianza: n, ciclosComputo: n, slotsAtencion: n, autoritarismo: n, hostilidadNorte: n,
    asignacionDivisas: bySector,
  }),
  economia: z.object({
    shareExportCobre: n, kCobre: n, importAlimentosUnidades: n, precioImportAlimento: n,
    presupuestoInsumosDia: n, servicioDeudaDia: n, energiaPeso: n,
    a1: n, a2: n, a3: n, controlBase: n, controlPendiente: n,
    b1: n, b2: n, b3: n, b4: n, inflacionBase: n,
    emisionNivel: byEmision, emisionAnimo: byEmision, fiscalizacionNivel: byFisc, fiscalizacionAnimo: byFisc,
    indexacionSalarial: n, ajustePreciosDecay: n,
    pesoCategoria: z.object({ BASICOS: n, MANUFACTURAS: n, SERVICIOS: n }),
  }),
  limites: z.object({ metaMin: n, metaMax: n, precioMaxCambio: n }),
  exogeno: z.object({
    cobreMedia: n, cobreReversion: n, cobreVolatilidad: n, derivaPrecioImportDia: n,
    depreciacionCapacidadDia: n, desgasteMetaCapacidad: n, desgasteMetaMoral: n, moralConvergencia: n,
  }),
  cyberfolk: z.object({ w1: n, w2: n, w3: n, ruido: n, abastBonusDecay: n, vocesMin: n, vocesMax: n }),
  escalas: z.object({ divisasMax: n, inflacionMax: n, deudaRef: n, importAlimentosRef: n }),
  colapso: z.object({
    produccionMin: n, produccionDias: n, abastecimientoMin: n, abastecimientoDias: n, divisasDias: n, animoMin: n,
  }),
  palancas: z.object({
    minutosPorCambio: n,
    retrasoDias: byLeverOrAutonomy(z.tuple([n, n])),
    desbloqueoDia: byLeverOrAutonomy(n),
    reajusteMax: n, reajusteAnimo: n,
    costoPolitico: z.object({ precioPorPunto: n, RACIONAMIENTO: n, ESTRICTO: n, CENTRALIZADO: n }),
    prioridadBonus: n, maxZonasPrioritarias: n,
    inversion: z.object({ costoPorCapacidad: n, aumento: n, diasPorSector: bySector }),
  }),
  cobre: z.object({ refinadoValorInicial: n, refinadoValorMax: n, madurezDia: n }),
  autonomia: z.object({ AUTOGESTION: autonomiaEfecto, COORDINADO: autonomiaEfecto, CENTRALIZADO: autonomiaEfecto }),
  observacion: z.object({ ruido: byAct, ruidoMercadoNegro: n, ruidoInflacion: n, investigarMin: n, investigarDias: n }),
  cyberstride: z.object({
    alpha: n, beta: n, bandaSigmas: n, bandaMinPct: n, minPuntos: n, tendenciaDias: n, tendenciaMinPct: n, horizonte: n, bandaRuidoMult: n,
  }),
  checo: z.object({
    costoHoras: z.object({ '7': n, '30': n }), errorPct: z.object({ '7': n, '30': n }),
    sesgoParametros: n, maxRuns: n,
  }),
  algedonico: z.object({
    venceMin: z.object({ '1': n, '2': n, '3': n }), probHora: n, averiasDia: byAct, maxDia: byAct,
    confianzaExpira: n, confianzaResuelve: n, eficienciaAveria: n, recuperacionEficienciaDia: n,
  }),
  politica: z.object({
    capitalBase: n, capitalAbastAlto: n, capitalAnimoAlto: n, capitalAbastBajo: n, capitalMax: n,
    umbralAbastAlto: n, umbralAnimoAlto: n, umbralAbastBajo: n, umbralAnimoBajo: n,
    confianzaAbastBajo: n, confianzaAnimoBajo: n, confianzaBien: n,
    autoritarismoFiscalizacion: byFisc,
  }),
  dificultad: z.record(z.enum(['HISTORIA', 'NORMAL', 'BEER']), z.object({ ruido: n, checoError: n })),
});
export type Balance = z.infer<typeof BalanceSchema>;

export const SectorDefSchema = z.object({
  id: sectorId, nombre: z.string(), insumoPorUnidad: n, precioImport: n, moralInicial: n,
  ramas: z.array(z.object({ id: z.string(), nombre: z.string() })),
});
export const ZoneDefSchema = z.object({
  id: zoneId, nombre: z.string(), poblacion: n, acceso: n, lugares: z.array(z.string()).min(1),
});
export const FirmDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/), nombre: z.string(), sector: sectorId, rama: z.string(), zona: zoneId,
  capacidad: n.positive(), autonomia: AutonomySchema,
});
export const AlgTemplateSchema = z.object({
  id: z.string(),
  origen: z.enum(['FIRM', 'ZONE', 'SECTOR']),
  cond: CondSchema.optional(),
  azar: z.boolean().optional(),
  cooldownDias: n,
  causa: z.string(),
  opciones: z.array(z.object({
    id: z.string(), texto: z.string(), duraMin: n.positive(), efectos: z.array(EffectSchema),
    costo: z.object({ divisas: n.optional(), capitalPolitico: n.optional() }).optional(),
  })).min(1),
  autoOpcion: z.string(),
  alIgnorar: z.array(EffectSchema),
});
export const VoicesSchema = z.object({
  bienes: z.array(z.string()).min(1),
  dias: z.array(z.string()).min(1),
  plantillas: z.array(z.object({ id: z.string(), tono: z.enum(['NEG', 'POS']), cond: CondSchema, texto: z.string() })),
});

export type SectorDef = z.infer<typeof SectorDefSchema>;
export type ZoneDef = z.infer<typeof ZoneDefSchema>;
export type FirmDef = z.infer<typeof FirmDefSchema>;
export type AlgTemplate = z.infer<typeof AlgTemplateSchema>;
export type VoicesData = z.infer<typeof VoicesSchema>;

export interface GameData {
  balance: Balance;
  sectors: SectorDef[];
  zones: ZoneDef[];
  firms: FirmDef[];
  algedonic: AlgTemplate[];
  voices: VoicesData;
}

export interface RawGameData {
  balance: unknown; sectors: unknown; zones: unknown; firms: unknown; algedonic: unknown; voices: unknown;
}

/** Valida el JSON crudo y comprueba consistencia referencial. Lanza si algo está mal. */
export function parseGameData(raw: RawGameData): GameData {
  const balance = BalanceSchema.parse(raw.balance);
  const sectors = z.array(SectorDefSchema).parse(raw.sectors);
  const zones = z.array(ZoneDefSchema).parse(raw.zones);
  const firms = z.array(FirmDefSchema).parse(raw.firms);
  const algedonic = z.array(AlgTemplateSchema).parse(raw.algedonic);
  const voices = VoicesSchema.parse(raw.voices);

  for (const id of SECTOR_IDS) if (!sectors.some((s) => s.id === id)) throw new Error(`Falta el sector ${id}`);
  for (const id of ZONE_IDS) if (!zones.some((z_) => z_.id === id)) throw new Error(`Falta la zona ${id}`);
  const pop = zones.reduce((a, z_) => a + z_.poblacion, 0);
  if (Math.abs(pop - 1) > 1e-6) throw new Error(`La población de las zonas suma ${pop}, debe sumar 1`);
  const asig = Object.values(balance.inicio.asignacionDivisas).reduce((a, v) => a + v, 0);
  if (Math.abs(asig - 1) > 1e-6) throw new Error(`asignacionDivisas suma ${asig}, debe sumar 1`);
  const ids = new Set<string>();
  for (const f of firms) {
    if (ids.has(f.id)) throw new Error(`Empresa duplicada: ${f.id}`);
    ids.add(f.id);
    const sec = sectors.find((s) => s.id === f.sector)!;
    if (!sec.ramas.some((r) => r.id === f.rama)) throw new Error(`Rama ${f.rama} no existe en ${f.sector} (${f.id})`);
  }
  for (const t of algedonic) {
    if (!t.cond && !t.azar) throw new Error(`Algedónica ${t.id}: necesita cond o azar`);
    if (!t.opciones.some((o) => o.id === t.autoOpcion)) throw new Error(`Algedónica ${t.id}: autoOpcion inexistente`);
  }
  return { balance, sectors, zones, firms, algedonic, voices };
}
