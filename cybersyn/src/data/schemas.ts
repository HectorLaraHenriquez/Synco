import { z } from 'zod';

export const SECTOR_IDS = ['MIN', 'IND', 'CON', 'AGR', 'ENT'] as const;
export const ZONE_IDS = ['NG', 'NC', 'VAL', 'STGO', 'OM', 'BIO', 'ARL', 'AUS'] as const;
export type SectorId = (typeof SECTOR_IDS)[number];
export type ZoneId = (typeof ZONE_IDS)[number];

const sectorId = z.enum(SECTOR_IDS);
const zoneId = z.enum(ZONE_IDS);
const bySector = z.record(sectorId, z.number());

export const AutonomySchema = z.enum(['AUTOGESTION', 'COORDINADO', 'CENTRALIZADO']);
export type Autonomy = z.infer<typeof AutonomySchema>;

export const BalanceSchema = z.object({
  version: z.number(),
  tiempo: z.object({ horasPorDia: z.number(), horaInicio: z.number(), diasCampana: z.number() }),
  inicio: z.object({
    divisas: z.number(), precioCobre: z.number(), ipc: z.number(), empleo: z.number(),
    mercadoNegro: z.number(), deudaExterna: z.number(), moral: z.number(), animo: z.number(),
    brechaInicial: z.number(), utilizacionBase: z.number(), soberaniaCultural: z.number(),
    stockDiasInsumos: z.number(), capitalPolitico: z.number(), confianza: z.number(),
    ciclosComputo: z.number(), slotsAtencion: z.number(), autoritarismo: z.number(),
    hostilidadNorte: z.number(),
    asignacionDivisas: bySector,
  }),
  economia: z.object({
    shareExportCobre: z.number(), kCobre: z.number(),
    importAlimentosUnidades: z.number(), precioImportAlimento: z.number(),
    presupuestoInsumosDia: z.number(), servicioDeudaDia: z.number(), energiaPeso: z.number(),
    a1: z.number(), a2: z.number(), a3: z.number(),
    controlBase: z.number(), controlPendiente: z.number(),
    b1: z.number(), b2: z.number(), b3: z.number(), b4: z.number(), inflacionBase: z.number(),
    emisionNivel: z.object({ BAJO: z.number(), MEDIO: z.number(), ALTO: z.number() }),
    emisionAnimo: z.object({ BAJO: z.number(), MEDIO: z.number(), ALTO: z.number() }),
    fiscalizacionNivel: z.object({ OFF: z.number(), RACIONAMIENTO: z.number(), ESTRICTO: z.number() }),
    fiscalizacionAnimo: z.object({ OFF: z.number(), RACIONAMIENTO: z.number(), ESTRICTO: z.number() }),
    indexacionSalarial: z.number(), ajustePreciosDecay: z.number(),
    pesoCategoria: z.object({ BASICOS: z.number(), MANUFACTURAS: z.number(), SERVICIOS: z.number() }),
  }),
  limites: z.object({ metaMin: z.number(), metaMax: z.number(), precioMaxCambio: z.number() }),
  exogeno: z.object({
    cobreMedia: z.number(), cobreReversion: z.number(), cobreVolatilidad: z.number(),
    derivaPrecioImportDia: z.number(), depreciacionCapacidadDia: z.number(),
    desgasteMetaCapacidad: z.number(), desgasteMetaMoral: z.number(), moralConvergencia: z.number(),
  }),
  cyberfolk: z.object({ w1: z.number(), w2: z.number(), w3: z.number(), ruido: z.number() }),
  escalas: z.object({
    divisasMax: z.number(), inflacionMax: z.number(), deudaRef: z.number(), importAlimentosRef: z.number(),
  }),
  colapso: z.object({
    produccionMin: z.number(), produccionDias: z.number(),
    abastecimientoMin: z.number(), abastecimientoDias: z.number(),
    divisasDias: z.number(), animoMin: z.number(),
  }),
});
export type Balance = z.infer<typeof BalanceSchema>;

export const SectorDefSchema = z.object({
  id: sectorId,
  nombre: z.string(),
  insumoPorUnidad: z.number(),
  precioImport: z.number(),
  moralInicial: z.number(),
  ramas: z.array(z.object({ id: z.string(), nombre: z.string() })),
});
export const ZoneDefSchema = z.object({
  id: zoneId, nombre: z.string(), poblacion: z.number(), acceso: z.number(),
});
export const FirmDefSchema = z.object({
  id: z.string(), nombre: z.string(), sector: sectorId, rama: z.string(), zona: zoneId,
  capacidad: z.number().positive(), autonomia: AutonomySchema,
});

export type SectorDef = z.infer<typeof SectorDefSchema>;
export type ZoneDef = z.infer<typeof ZoneDefSchema>;
export type FirmDef = z.infer<typeof FirmDefSchema>;

export interface GameData {
  balance: Balance;
  sectors: SectorDef[];
  zones: ZoneDef[];
  firms: FirmDef[];
}

/** Valida el JSON crudo y comprueba consistencia referencial. Lanza si algo está mal. */
export function parseGameData(raw: { balance: unknown; sectors: unknown; zones: unknown; firms: unknown }): GameData {
  const balance = BalanceSchema.parse(raw.balance);
  const sectors = z.array(SectorDefSchema).parse(raw.sectors);
  const zones = z.array(ZoneDefSchema).parse(raw.zones);
  const firms = z.array(FirmDefSchema).parse(raw.firms);

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
  return { balance, sectors, zones, firms };
}
