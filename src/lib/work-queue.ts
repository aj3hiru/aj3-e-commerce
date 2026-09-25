/**
 * A waiting line for heavy work (placing orders). At most `concurrency` run at
 * once; the rest wait here in memory — not holding database connections — and
 * go in turn. If the line is so long that someone would wait longer than
 * `maxWaitMs`, they get a friendly "busy, try again" instead of a hang or crash.
 */
export class BusyError extends Error {
  constructor() { super("We're getting a lot of orders right now. Please try again in a few seconds."); }
}

type Waiter = { go: () => void; timer: ReturnType<typeof setTimeout> };
type Line = { running: number; waiting: Waiter[] };
const g = globalThis as unknown as { __workLines?: Map<string, Line> };
const lines = (g.__workLines ??= new Map());

export async function inLine<T>(name: string, concurrency: number, maxWaitMs: number, work: () => Promise<T>): Promise<T> {
  let line = lines.get(name);
  if (!line) lines.set(name, (line = { running: 0, waiting: [] }));
  const l = line;
  if (l.running >= concurrency) {
    await new Promise<void>((resolve, reject) => {
      const w: Waiter = {
        go: () => { clearTimeout(w.timer); resolve(); },
        timer: setTimeout(() => { l.waiting.splice(l.waiting.indexOf(w), 1); reject(new BusyError()); }, maxWaitMs),
      };
      l.waiting.push(w);
    });
  } else {
    l.running++;
  }
  try {
    return await work();
  } finally {
    const next = l.waiting.shift();
    if (next) next.go(); // hand the slot straight to the next in line
    else l.running--;
  }
}
