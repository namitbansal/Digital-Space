import { DEBUG_LOGGING_ENABLED } from '../constants/debug-logging.config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StackFrame {
  file: string;
  function: string;
  line: number;
}

const LOGGER_FRAME_MARKERS = ['logger.util', 'logger.service'];

function shortFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

function parseStackLine(line: string): StackFrame | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'Error') return null;

  const chrome = /^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(trimmed);
  if (chrome) {
    const fn = chrome[1]?.trim() || '<anonymous>';
    return {
      function: fn,
      file: shortFileName(chrome[2]),
      line: Number(chrome[3]),
    };
  }

  const firefox = /^\s*(?:(.+?)@)?(.+?):(\d+):(\d+)\s*$/.exec(trimmed);
  if (firefox) {
    return {
      function: firefox[1]?.trim() || '<anonymous>',
      file: shortFileName(firefox[2]),
      line: Number(firefox[3]),
    };
  }

  return null;
}

function isLoggerFrame(frame: StackFrame): boolean {
  return LOGGER_FRAME_MARKERS.some((marker) => frame.file.includes(marker));
}

function parseCallSites(): { site: StackFrame; caller: StackFrame | null } {
  const stack = new Error().stack ?? '';
  const frames = stack
    .split('\n')
    .map(parseStackLine)
    .filter((frame): frame is StackFrame => frame !== null)
    .filter((frame) => !isLoggerFrame(frame));

  const site = frames[0] ?? { file: 'unknown', function: 'unknown', line: 0 };
  const caller = frames[1] ?? null;
  return { site, caller };
}

function formatPrefix(site: StackFrame, caller: StackFrame | null): string {
  const location = `${site.file}:${site.function}:${site.line}`;
  if (!caller) return `[${location}]`;
  return `[${location} <- ${caller.file}:${caller.function}:${caller.line}]`;
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (!DEBUG_LOGGING_ENABLED) return;

  const { site, caller } = parseCallSites();
  const prefix = formatPrefix(site, caller);
  const text = `${prefix} ${message}`;

  if (data === undefined) {
    console[level === 'debug' ? 'log' : level](text);
    return;
  }

  console[level === 'debug' ? 'log' : level](text, data);
}

export const AppLogger = {
  debug(message: string, data?: unknown): void {
    writeLog('debug', message, data);
  },

  info(message: string, data?: unknown): void {
    writeLog('info', message, data);
  },

  warn(message: string, data?: unknown): void {
    writeLog('warn', message, data);
  },

  error(message: string, data?: unknown): void {
    writeLog('error', message, data);
  },

  enter(label?: string, data?: unknown): void {
    writeLog('debug', `→ ENTER ${label ?? ''}`.trim(), data);
  },

  exit(label?: string, data?: unknown): void {
    writeLog('debug', `← EXIT ${label ?? ''}`.trim(), data);
  },

  step(message: string, data?: unknown): void {
    writeLog('debug', `● ${message}`, data);
  },
};
