/**
 * Minimal structured-ish logger. A deliberate POC choice over pino/winston:
 * zero dependencies, and small enough that "no secrets are ever logged" is
 * verifiable by reading one file. See docs/DECISIONS.md.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configured: Level =
  (process.env.LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === 'test' ? 'error' : 'info');

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configured]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const args: unknown[] = [line];
  if (context && Object.keys(context).length > 0) args.push(context);
  console[level === 'debug' ? 'log' : level](...args);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write('error', msg, ctx),
};
