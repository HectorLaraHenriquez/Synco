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

## Convenciones
- `src/sim` nunca importa Phaser ni toca el DOM. Funciones puras: clonan y devuelven estado nuevo (`structuredClone`).
- Toda constante numérica de balance va en `public/data/balance.json`, no en el código. Todo texto visible va en JSON.
- Contenido = JSON validado con zod (`src/data/schemas.ts`). `node-loader.ts` sólo para Node; `loader.ts` para navegador.
- Determinismo: todo azar sale de `GameState.rng` (mulberry32). Misma semilla = misma partida.
- Cada módulo de `sim` tiene su test en `tests/sim`. Commits pequeños por hito; no avanzar de hito sin tests verdes.
- Los números visibles deben pasar por `report()` (H2); la UI no lee valores reales salvo en nodos investigados.

## Comandos
- `npm test` · `npm run typecheck` · `npm run sim -- --policy none|reasonable --seed X --days 30`

## Estado
- **H1 (núcleo de simulación): hecho.** Falta H2+ (palancas con retraso, Cyberstride, Checo, Cyberfolk, algedónicas...).
- Desviación consciente: `factorInsumos` usa flujo + stock por sub-paso (`min(1,(stock+llegada·dt)/consumo·dt)`), no sólo `insumos/requeridoDia`; evita que el stock vacío anule la producción aunque lleguen insumos.
- El engine se crea con `createEngine(data)` (cierra sobre los datos) en vez de funciones sueltas.
