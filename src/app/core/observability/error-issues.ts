import type { ChipTone } from '$ui/components/chip/chip';
import type { ErrorIssueHour } from './observability.consumes';

/**
 * What the Errors page and the issue page share about qits-observability's stored error issues
 * (qits-2538): the state lens, an issue's title and tone, and the hourly chart's bars.
 */

/** The states the Errors page's segmented control offers; OPEN is the door's default. */
export const ISSUE_STATES = ['OPEN', 'DISMISSED', 'ALL'] as const;

export type IssueState = (typeof ISSUE_STATES)[number];

/** `value` as one of the offered states, OPEN when it is none of them. */
export function issueStateOf(value: string | null | undefined): IssueState {
  const upper = value?.toUpperCase();
  return ISSUE_STATES.find((state) => state === upper) ?? 'OPEN';
}

/** A state's label on the segmented control. */
export function issueStateLabel(state: IssueState): string {
  return state === 'OPEN' ? 'Open' : state === 'DISMISSED' ? 'Dismissed' : 'All';
}

/** `java.lang.IllegalStateException` → `IllegalStateException` (and a nested class's own name). */
export function simpleType(exceptionType: string | null | undefined): string {
  if (!exceptionType) return '';
  return exceptionType.split('.').pop()?.split('$').pop() ?? exceptionType;
}

/** An issue's title: `<simple exception type>: <message>`, the message alone, or the type alone. */
export function issueTitle(issue: {
  readonly exceptionType?: string | null;
  readonly message?: string | null;
}): string {
  const type = simpleType(issue.exceptionType);
  const message = issue.message ?? '';
  if (type && message) return `${type}: ${message}`;
  return type || message;
}

/** Whether an issue shows as regressed: it came back after a dismissal and is OPEN again. */
export function isRegressed(issue: {
  readonly state?: string | null;
  readonly regressions?: number | null;
}): boolean {
  return issue.state === 'OPEN' && (issue.regressions ?? 0) > 0;
}

/** A state as a chip's tone: OPEN is a failure still standing, anything else is quiet. */
export function issueStateTone(state: string | null | undefined): ChipTone {
  return state === 'OPEN' ? 'failed' : 'neutral';
}

/** The hours the issue page charts: seven days, the door's default `hours`. */
export const CHART_HOURS = 168;

/** One bar of the hourly chart: its hour (ISO, UTC), its count and its height in percent. */
export interface HourBar {
  readonly hour: string;
  readonly count: number;
  readonly height: string;
}

/** The hourly chart: one bar per hour, oldest first, with what its caption says. */
export interface HourChart {
  readonly bars: readonly HourBar[];
  /** The first and last hour charted (ISO, UTC); empty when nothing is charted. */
  readonly from: string;
  readonly to: string;
  /** The largest count of one hour, the chart's scale. */
  readonly max: number;
  /** The occurrences the chart holds, which may be fewer than the issue's total. */
  readonly total: number;
}

const HOUR_MS = 3_600_000;

/** `iso` cut down to its hour, as epoch milliseconds; NaN when it is no instant. */
function hourOf(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? NaN : Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * The hourly chart of `hourly` over {@link CHART_HOURS} hours ending at the newest hour the issue
 * was seen (the latest of its counted hours and `lastSeen`), never the clock: the page draws the
 * same bars whenever it is opened, and an issue quiet for days still shows its last week. An hour
 * the service lists twice is counted once with both counts; an hour before the window is left out;
 * an hour with no count is an empty bar. A non-empty bar is at least 4% tall, so one occurrence
 * beside a busy hour stays visible.
 */
export function hourChart(
  hourly: readonly ErrorIssueHour[] | null | undefined,
  lastSeen: string | null | undefined,
): HourChart {
  const counts = new Map<number, number>();
  for (const entry of hourly ?? []) {
    const hour = hourOf(entry.hour);
    if (Number.isNaN(hour)) continue;
    counts.set(hour, (counts.get(hour) ?? 0) + (entry.count ?? 0));
  }
  const newest = Math.max(hourOf(lastSeen) || -Infinity, ...counts.keys());
  if (!Number.isFinite(newest)) return { bars: [], from: '', to: '', max: 0, total: 0 };
  const first = newest - (CHART_HOURS - 1) * HOUR_MS;
  let max = 0;
  let total = 0;
  const slots: { hour: number; count: number }[] = [];
  for (let hour = first; hour <= newest; hour += HOUR_MS) {
    const count = counts.get(hour) ?? 0;
    max = Math.max(max, count);
    total += count;
    slots.push({ hour, count });
  }
  const bars = slots.map(({ hour, count }): HourBar => ({
    hour: new Date(hour).toISOString(),
    count,
    height: count === 0 || max === 0 ? '0%' : `${Math.max(4, (count / max) * 100)}%`,
  }));
  return { bars, from: bars[0].hour, to: bars[bars.length - 1].hour, max, total };
}

/** An hour as the chart's tooltip and axis say it: `2026-01-01 14:00 UTC`. */
export function hourLabel(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '';
}

/**
 * The telemetry buffer's source of a platform service's records (`_service/<name>`), at which the
 * trace page reads the issue's sample trace.
 */
export function serviceSource(serviceName: string | null | undefined): string {
  return serviceName ? `_service/${serviceName}` : '';
}

/** How many lines of the sample stack trace a ticket made from an issue carries. */
export const TICKET_STACK_LINES = 40;

/** What a ticket made from an issue is filled with: its title and its description (Markdown). */
export interface TicketDraft {
  readonly title: string;
  readonly description: string;
}

/**
 * The ticket Make ticket fills the work create form with (qits-2538): the issue's title (else its
 * fingerprint), and a description saying where (service, location, versions), when (first and last
 * seen), how often (occurrences) and the first {@link TICKET_STACK_LINES} lines of the sample stack
 * trace in a code block. A fact the issue lacks is a dash; no stack trace, no block.
 */
export function ticketDraft(issue: {
  readonly fingerprint?: string | null;
  readonly exceptionType?: string | null;
  readonly message?: string | null;
  readonly serviceName?: string | null;
  readonly location?: string | null;
  readonly firstVersion?: string | null;
  readonly lastVersion?: string | null;
  readonly firstSeen?: string | null;
  readonly lastSeen?: string | null;
  readonly occurrences?: number | null;
  readonly sampleStacktrace?: string | null;
}): TicketDraft {
  const or = (value: string | null | undefined) => value || '—';
  const code = (value: string | null | undefined) => (value ? `\`${value}\`` : '—');
  const lines = [
    `Made from error issue ${code(issue.fingerprint)}.`,
    '',
    `- Service: ${or(issue.serviceName)}`,
    `- Location: ${code(issue.location)}`,
    `- Versions: ${or(issue.firstVersion)} → ${or(issue.lastVersion)}`,
    `- First seen: ${or(issue.firstSeen)}`,
    `- Last seen: ${or(issue.lastSeen)}`,
    `- Occurrences: ${issue.occurrences ?? 0}`,
  ];
  const stack = (issue.sampleStacktrace ?? '').replace(/\s+$/, '');
  if (stack) {
    const all = stack.split('\n');
    const shown = all.slice(0, TICKET_STACK_LINES);
    lines.push(
      '',
      all.length > shown.length
        ? `Stack trace (the first ${TICKET_STACK_LINES} of ${all.length} lines):`
        : 'Stack trace:',
      '',
      '```',
      ...shown,
      '```',
    );
  }
  return {
    title: issueTitle(issue) || `Error issue ${issue.fingerprint ?? ''}`.trim(),
    description: lines.join('\n'),
  };
}
