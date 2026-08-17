// Minimal leveled logger, gated by the LOG_LEVEL env var.
//
// Levels (most → least verbose): debug > info > warn > error > silent.
// Default is "info": info/warn/error are shown, debug is hidden.
//
//   LOG_LEVEL=debug   → everything, including Monte-Carlo trick traces
//   LOG_LEVEL=info    → info + warn + error (default)
//   LOG_LEVEL=warn    → warn + error only
//   LOG_LEVEL=error   → errors only
//   LOG_LEVEL=silent  → nothing

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return RANK[raw] !== undefined ? raw : 'info';
}

function enabled(level: LogLevel): boolean {
  return RANK[level] <= RANK[currentLevel()];
}

export const log = {
  debug: (...args: unknown[]) => { if (enabled('debug')) console.log(...args); },
  info: (...args: unknown[]) => { if (enabled('info')) console.log(...args); },
  warn: (...args: unknown[]) => { if (enabled('warn')) console.warn(...args); },
  error: (...args: unknown[]) => { if (enabled('error')) console.error(...args); },
};
