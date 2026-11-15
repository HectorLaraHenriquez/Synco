/** Partida en curso: estado + reloj en tiempo real. Sin Phaser, para poder testearla. */
import { finDeJornada } from '../sim/advance';
import type { Command } from '../sim/commands';
import type { Ctx } from '../sim/ctx';
import type { Engine } from '../sim/engine';
import type { DaySnapshot, Difficulty, GameState, NationalIndicators } from '../sim/state';

export interface DayClose { antes: NationalIndicators; snap: DaySnapshot }

export class Session {
  state: GameState;
  paused = false;
  /** Multiplicador del reloj (opciones / pruebas). */
  speed = 1;
  lastError?: { code: string; realMs: number };
  /** Indicadores reales al abrir el día (para el informe de cierre). */
  private inicioDia: NationalIndicators;
  private accMin = 0;
  private realMs = 0;
  private listeners = new Set<() => void>();

  /** `inicio` puede ser una semilla (partida nueva) o un estado guardado. */
  constructor(readonly engine: Engine, inicio: string | GameState, difficulty: Difficulty = 'NORMAL') {
    this.state = typeof inicio === 'string' ? engine.init(inicio, difficulty) : inicio;
    this.inicioDia = { ...this.state.indicators };
  }

  get ctx(): Ctx {
    return this.engine.ctx;
  }
  get over(): boolean {
    return this.engine.isOver(this.state);
  }
  /** La jornada terminó: toca el cierre. */
  get dayOver(): boolean {
    return this.over || this.state.hour >= finDeJornada(this.ctx) - 1e-9;
  }
  get now(): number {
    return this.realMs;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** Envía un comando al motor. Devuelve el código de error si se rechaza. */
  dispatch(cmd: Command): string | undefined {
    const r = this.engine.tryCommand(this.state, cmd);
    if (r.ok) {
      this.state = r.state;
      this.lastError = undefined;
    } else this.lastError = { code: r.error, realMs: this.realMs };
    this.emit();
    return r.ok ? undefined : r.error;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.emit();
  }

  /** Avanza el reloj real; la simulación corre en minutos de juego enteros. */
  advanceReal(ms: number): void {
    this.realMs += ms;
    if (this.paused || this.dayOver) return;
    this.accMin += (ms / 1000) * (60 / this.ctx.bal.tiempo.segundosPorHora) * this.speed;
    const whole = Math.floor(this.accMin);
    if (whole < 1) return;
    this.accMin -= whole;
    this.state = this.engine.tick(this.state, whole / 60);
    this.emit();
  }

  /** Cierre del día: corre endDay y devuelve la comparación para el informe. */
  closeDay(): DayClose {
    const antes = this.inicioDia;
    this.state = this.engine.endDay(this.state);
    this.inicioDia = { ...this.state.indicators };
    this.accMin = 0;
    this.paused = false;
    this.emit();
    return { antes, snap: this.state.history[this.state.history.length - 1]! };
  }
}
