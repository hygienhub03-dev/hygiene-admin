type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  ts: string
  level: LogLevel
  msg: string
  ctx?: LogContext
  err?: { name: string; message: string; stack?: string }
}

function format(entry: LogEntry): string {
  const base = `[${entry.ts}] ${entry.level.toUpperCase()}: ${entry.msg}`
  if (entry.err) {
    const stack = entry.err.stack ? ` ${entry.err.stack}` : ''
    return `${base} ${entry.err.name}: ${entry.err.message}${stack}`
  }
  if (entry.ctx && Object.keys(entry.ctx).length > 0) {
    return `${base} ${JSON.stringify(entry.ctx)}`
  }
  return base
}

function log(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
  }
  if (ctx && Object.keys(ctx).length > 0) entry.ctx = ctx
  if (err instanceof Error) {
    entry.err = { name: err.name, message: err.message, stack: err.stack }
  } else if (err !== undefined) {
    entry.err = { name: 'Error', message: String(err) }
  }

  const line = format(entry)
  if (level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext, err?: unknown) => log('error', msg, ctx, err),
}
