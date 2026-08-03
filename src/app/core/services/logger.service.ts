import { Injectable } from '@angular/core';
import { DEBUG_LOGGING_ENABLED } from '../constants/debug-logging.config';
import { AppLogger, LogLevel } from './logger.util';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, data?: unknown): void {
    AppLogger.debug(message, data);
  }

  info(message: string, data?: unknown): void {
    AppLogger.info(message, data);
  }

  warn(message: string, data?: unknown): void {
    AppLogger.warn(message, data);
  }

  error(message: string, data?: unknown): void {
    AppLogger.error(message, data);
  }

  enter(label?: string, data?: unknown): void {
    AppLogger.enter(label, data);
  }

  exit(label?: string, data?: unknown): void {
    AppLogger.exit(label, data);
  }

  step(message: string, data?: unknown): void {
    AppLogger.step(message, data);
  }

  isEnabled(): boolean {
    return DEBUG_LOGGING_ENABLED;
  }
}

export type { LogLevel };
