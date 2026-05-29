export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  #level: number;

  constructor(level: LogLevel = "warn") {
    this.#level = LEVEL_ORDER[level];
  }

  debug(...args: unknown[]) {
    if (this.#level <= 0) console.debug(...args);
  }

  info(...args: unknown[]) {
    if (this.#level <= 1) console.info(...args);
  }

  warn(...args: unknown[]) {
    if (this.#level <= 2) console.warn(...args);
  }

  error(...args: unknown[]) {
    if (this.#level <= 3) console.error(...args);
  }
}
