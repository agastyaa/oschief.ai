/**
 * Structured logger for the Electron main process.
 *
 * Levels: debug < info < warn < error. Default level is 'info' in production,
 * 'debug' when NODE_ENV=development. Override with LOG_LEVEL env var
 * (debug|info|warn|error).
 *
 * Output shape:
 *   - development: pretty prefix `[module] message` + extra key=value pairs
 *   - production:  single-line JSON `{"ts","level","module","msg",...}`
 *
 * Drop-in replacement for ad-hoc `console.*` calls. Create a scoped logger
 * with `createLogger('module-name')` and keep the name stable — it's the grep
 * key in logs.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function resolveLevel(): Level {
  const env = (process.env.LOG_LEVEL || '').toLowerCase()
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

const currentLevel = resolveLevel()
const isDev = process.env.NODE_ENV === 'development'

function enabled(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel]
}

function formatPretty(module: string, level: Level, msg: string, extra?: Record<string, unknown>): string {
  const tag = `[${module}]`
  if (!extra || Object.keys(extra).length === 0) return `${tag} ${msg}`
  const pairs = Object.entries(extra)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
  return `${tag} ${msg} ${pairs}`
}

function formatJson(module: string, level: Level, msg: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(extra || {}),
  })
}

function emit(level: Level, module: string, msg: string, extra?: Record<string, unknown>): void {
  if (!enabled(level)) return
  const line = isDev ? formatPretty(module, level, msg, extra) : formatJson(module, level, msg, extra)
  // eslint-disable-next-line no-console -- single sanctioned console usage in the main process
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(line)
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void
  info(msg: string, extra?: Record<string, unknown>): void
  warn(msg: string, extra?: Record<string, unknown>): void
  error(msg: string, extra?: Record<string, unknown>): void
  child(subModule: string): Logger
}

export function createLogger(module: string): Logger {
  return {
    debug: (msg, extra) => emit('debug', module, msg, extra),
    info: (msg, extra) => emit('info', module, msg, extra),
    warn: (msg, extra) => emit('warn', module, msg, extra),
    error: (msg, extra) => emit('error', module, msg, extra),
    child: (sub) => createLogger(`${module}:${sub}`),
  }
}

/** Default logger for the main process. Prefer createLogger('module-name'). */
export const log = createLogger('main')
