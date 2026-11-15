# Cybersyn: Sala de Operaciones

Juego de gestión económica pausable, jugado desde la Opsroom (Chile 1974–76, Cybersyn sobrevivió). Navegador, TypeScript + Vite + Phaser 3 (sólo presentación). Textos en español de Chile.

## Resumen del GDD (secciones 1–3)
- **Objetivo:** evitar el colapso, mejorar calidad de vida, lograr soberanía. Clímax días 26–30: intervención militar o invasión extranjera.
- **Pilares:** interpretar datos con ruido/retraso/sabotaje; decidir con modelos imperfectos (Checo); toda decisión cuesta; el pueblo responde (Cyberfolk); autonomía vs. control (VSM); estética modernista como interfaz.
- **Campaña:** 30 jornadas (3 actos + clímax). Jornada = 08:00–20:00 de juego (12 ticks de 1 h; ~10 min reales; pausable). Boletín → Operación → Algedónicas → Cierre → Consejo nocturno → guardado.
- **Recursos del jugador:** tiempo, ciclos de cómputo (4/día), atención (2 slots), capital político, confianza (0 = despido).
- **Mundo:** árbol VSM País → Sector (5: MIN IND CON AGR ENT) → Rama (~18) → Empresa (40 → 400). Autonomía por nodo: AUTOGESTION / COORDINADO / CENTRALIZADO.
- **Pantallas:** Datafeed, Cyberstride, Checo, Algedónico, Cyberfolk, Red + franja de indicadores, télex y consola de palancas.
- **Economía (3.3):** producción = capacidad·utilización·factorInsumos·factorMoral·(1−sabotaje); divisas por cobre; brecha oferta/demanda de básicos → mercado negro → inflación → ánimo → moral → producción. Pasividad pierde: 30 días sin intervención colapsan entre el día 12 y el 30.
- **Palancas (3.4):** precios, divisas por sector, metas, salarios, emisión, destino del cobre, distribución, fiscalización, inversión, autonomía. Con retraso realista (H2).
- **Sabotaje, facciones, tecnología, finales:** ver GDD §3.8, 3.9, 4, 5 (H6+).

## Arquitectura de `src/sim` (sin Phaser ni DOM)
- `engine.ts`: `createEngine(data)` → `init`, `tick(state, dtHoras)`, `endDay`, `runDay`, `applyCommand`/`tryCommand`, `forceLevers` (sólo tests). Todo puro: clona y devuelve estado nuevo.
- `advance.ts`: avance mutable (`stepMut`, `endDayMut`) que comparten el engine y Checo.
- `commands.ts`: única vía de la UI para cambiar el estado. Un comando rechazado devuelve el mismo estado y un código (`SIN_TIEMPO`, `PALANCA_BLOQUEADA`, `SIN_CICLOS`...). Los comandos con costo de reloj avanzan la simulación.
- `levers.ts`: borrador → EJECUTAR. Retrasos, desbloqueos por día (o flag `unlock.<palanca>`), costo de 10 min por palanca, capital político y divisas. `precios`, `reajusteSalarial` e `inversiones` son de un solo uso.
- `effects.ts`: intérprete de `Effect` con lista blanca de paths (`validateData` corre al cargar). Los retrasos viven en `pendingEffects` y se aplican al abrir el día.
- `observe.ts`: `report(state, ctx, nodo, indicador)` aplica ruido (hash determinista por día), retraso y falsificación. **La UI sólo lee números por aquí** (o `reportIndicators`, `visibleSeries`). `state.indicators` y `produccion` son valores REALES.
- `cyberstride.ts`: Holt + banda de tolerancia + alertas de desvío/tendencia sobre las series reportadas.
- `checo.ts`: simula sobre datos reportados, sin azar ni eventos ajenos al jugador, con sesgo propio de parámetros. Línea base vs. escenario (borrador).
- `cyberfolk.ts`: ánimo por zona, moral por sector (según dónde están sus empresas), voces del cierre.
- `algedonic.ts`: señales por condición o avería al azar; escalan al vencer; atender ocupa un slot.
- Nodos: `pais`, `sector:CON`, `rama:CON.textil`, `firm:<id>`, `zone:BIO`.

## Convenciones
- `src/sim` nunca importa Phaser ni toca el DOM. Funciones puras: clonan y devuelven estado nuevo (`structuredClone`).
- Toda constante numérica de balance va en `public/data/balance.json`, no en el código. Todo texto visible va en JSON.
- Contenido = JSON validado con zod (`src/data/schemas.ts`). `node-loader.ts` sólo para Node; `loader.ts` para navegador.
- Determinismo: todo azar sale de `GameState.rng` (mulberry32). Misma semilla = misma partida.
- Cada módulo de `sim` tiene su test en `tests/sim`. Commits pequeños por hito; no avanzar de hito sin tests verdes.
- Los números visibles deben pasar por `report()` (H2); la UI no lee valores reales salvo en nodos investigados.

## Dirección visual (decisión del autor, posterior al GDD)
- Sin pixel art: la referencia son las **diapositivas retroiluminadas de la Opsroom real** (Bauhaus, años 70, retrofuturismo). Formas planas, símbolos (○ □ ▽ △ ⬠), diagramas tipo sistema nervioso. Intuitivo, no un muro de tablas.
- 1440×810 vectorial (`src/ui/vector.ts`, fuentes Jost y Barlow Condensed). Paleta fija de 12 colores.
- Un tablero en calma muestra sólo contornos; lo que se enciende pide atención.

## Flujo de escenas
`Menu → [City (boletín del día + voces) → Sala (jornada) → DayReport (cierre)] × 30 → Menu`
- **City**: Santiago a lo lejos. Es la pantalla de la **historia** (boletín, voces; el autor agregará crecimiento de la ciudad, globos de diálogo, etc.). No controla la economía.
- **Sala**: la Opsroom dibujada, con pantallas vivas (VSM, ventana al país, tablero de símbolos, monitores). Todo se maneja con **fichas** (`src/ui/fichas.ts`) que se abren encima: consola de palancas, señales, Checo, alertas, sector (investigar, autonomía, invertir) y zona (investigar, prioridad).
- Guardado automático en localStorage al abrir cada día (`src/save/save.ts`).

## Comandos
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run sim -- --policy none|reasonable --seed X --days 30`

## Estado
- **H1, H2, H3 y versión jugable básica: hechos.** `npm run dev` para jugar; `?speed=N` acelera el reloj.
- UI: `src/game` (sesión, reloj y boletín, sin Phaser), `src/scenes`, `src/ui`. Textos en `public/data/ui/es.json`.
- Falta respecto del GDD: tooltips, télex, Consejo nocturno y tecnología (H5); sabotaje, facciones, eventos guionados, clímax y finales completos (H6); audio (H7).
- Prueba de humo en navegador: `npx vite build && npx vite preview --port 4173 &` y luego `node tools/e2e-smoke.cjs`.
- Pendiente de hitos posteriores: télex, Consejo y tecnología (H5); sabotaje, facciones, eventos, red y finales completos (H6). `TELEX_ACTION`, `COUNCIL_CHOICE` y `START_RESEARCH` responden `NO_IMPLEMENTADO`.
- Desviaciones conscientes del GDD:
  - `factorInsumos` usa flujo + stock por sub-paso, no sólo `insumos/requeridoDia`.
  - El engine es una fábrica (`createEngine(data)`), no funciones sueltas.
  - Se agregó `op: 'mul'` a `Effect` y `CLEAR_DRAFT` a `Command`.
  - El error de Checo se mide en puntos de la escala 0–100 de cada indicador.
  - La pasividad termina en DESPIDO o COLAPSO (días 12–30): ignorar algedónicas agota la confianza antes del colapso económico.
