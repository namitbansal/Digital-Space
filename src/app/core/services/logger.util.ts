import { Injectable } from '@angular/core';
import {
  IMPORTANT_LOGGING_ENABLED,
  VERBOSE_LOGGING_ENABLED,
} from '../constants/debug-logging.config';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const IMPORTANT_ON = IMPORTANT_LOGGING_ENABLED;
const VERBOSE_ON = IMPORTANT_LOGGING_ENABLED && VERBOSE_LOGGING_ENABLED;
const PREFIX = '[DigitalSpace]';

interface StackFrame {
  file: string;
  function: string;
  line: number;
}

const LOGGER_MARKERS = ['logger.util'];

function shortFile(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function parseFrame(line: string): StackFrame | null {
  const t = line.trim();
  if (!t || t === 'Error') return null;
  const m =
    /^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(t) ||
    /^\s*(?:(.+?)@)?(.+?):(\d+):(\d+)\s*$/.exec(t);
  if (!m) return null;
  return { function: m[1]?.trim() || '<anonymous>', file: shortFile(m[2]), line: Number(m[3]) };
}

function tracePrefix(): string {
  const frames = (new Error().stack ?? '')
    .split('\n')
    .map(parseFrame)
    .filter((f): f is StackFrame => f !== null && !LOGGER_MARKERS.some((m) => f.file.includes(m)));
  const site = frames[0] ?? { file: 'unknown', function: 'unknown', line: 0 };
  const caller = frames[1];
  const loc = `${site.file}:${site.function}:${site.line}`;
  return caller ? `[${loc} <- ${caller.file}:${caller.function}:${caller.line}]` : `[${loc}]`;
}

function out(level: 'log' | 'info' | 'warn' | 'error', text: string, data?: unknown): void {
  if (data === undefined) console[level](text);
  else console[level](text, data);
}

function info(message: string, data?: unknown): void {
  if (!IMPORTANT_ON) return;
  out('info', `${PREFIX} ${message}`, data);
}

function diagnostic(level: 'warn' | 'error', message: string, data?: unknown): void {
  if (!IMPORTANT_ON) return;
  out(level, `${tracePrefix()} ${message}`, data);
}

function verbose(message: string, data?: unknown): void {
  if (!VERBOSE_ON) return;
  out('log', `${tracePrefix()} ${message}`, data);
}

export const AppLogger = {
  info,
  warn: (m: string, d?: unknown) => diagnostic('warn', m, d),
  error: (m: string, d?: unknown) => diagnostic('error', m, d),
  enter: (label?: string, d?: unknown) => verbose(`→ ENTER ${label ?? ''}`.trim(), d),
  exit: (label?: string, d?: unknown) => verbose(`← EXIT ${label ?? ''}`.trim(), d),
  step: (m: string, d?: unknown) => verbose(`● ${m}`, d),
};

@Injectable({ providedIn: 'root' })
export class LoggerService {
  info = AppLogger.info;
  warn = AppLogger.warn;
  error = AppLogger.error;
  enter = AppLogger.enter;
  exit = AppLogger.exit;
  step = AppLogger.step;
  isImportantEnabled = () => IMPORTANT_ON;
  isVerboseEnabled = () => VERBOSE_ON;
}
