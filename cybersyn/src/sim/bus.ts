/** Event bus tipado. La simulación emite; la UI (y otros módulos) escuchan. */

export interface SimEvents {
  tick: { day: number; hour: number };
  dayEnded: { day: number };
  ending: { id: string; reason: string; day: number };
}

type Handler<T> = (payload: T) => void;

export class Bus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(ev: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(ev);
    if (!set) this.handlers.set(ev, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => this.off(ev, fn);
  }
  off<K extends keyof E>(ev: K, fn: Handler<E[K]>): void {
    this.handlers.get(ev)?.delete(fn as Handler<never>);
  }
  emit<K extends keyof E>(ev: K, payload: E[K]): void {
    this.handlers.get(ev)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
  }
  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new Bus<SimEvents>();
