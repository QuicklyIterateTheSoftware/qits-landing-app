import { QitsApiError } from '@qits/angular';
import type { ChipTone } from '$ui/components/chip/chip';

/**
 * What the Observability section's pages share about the telemetry buffer's records (qits-2313,
 * qits-2339): the time ranges, a record's time and level, and whether a read was refused.
 */

/** The time ranges the range filter offers, in minutes; none (Everything) is the default. */
export const SINCE_MINUTES = [15, 60, 360, 1440] as const;

/** A time range's label. */
export function sinceLabel(minutes: number): string {
  if (minutes < 60) return `Last ${minutes} minutes`;
  return minutes === 60 ? 'Last hour' : `Last ${minutes / 60} hours`;
}

/** `value` as a positive whole number of minutes, or undefined (Everything). */
export function minutesOf(value: string | null): number | undefined {
  const minutes = Number(value);
  return value && Number.isInteger(minutes) && minutes > 0 ? minutes : undefined;
}

/** A line's time, `YYYY-MM-DD HH:MM:SS.mmm` in UTC, from its `epochNanos`; empty when missing. */
export function lineTime(epochNanos: number | undefined): string {
  if (epochNanos === undefined) return '';
  const date = new Date(Math.round(epochNanos / 1e6));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

/** A line's level, as a chip's tone. */
export function levelTone(level: string | undefined): ChipTone {
  switch (level?.toUpperCase()) {
    case 'ERROR':
    case 'FATAL':
      return 'failed';
    case 'WARN':
      return 'waiting';
    default:
      return 'neutral';
  }
}

/** Whether a failed read was refused for the viewer's roles. */
export function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/** The `service.version` of a record's resource, or empty. */
export function versionOf(
  resourceAttributes: Readonly<Record<string, string>> | undefined,
): string {
  return resourceAttributes?.['service.version'] ?? '';
}
