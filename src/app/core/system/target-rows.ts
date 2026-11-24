import { formatBytes } from '$core/artifacts/artifact-listings';
import type { ChipTone } from '$ui/components/chip/chip';
import type { TargetRow } from './targets.consumes';

/** The slot types a target's card lists, in this order (qits-system's `SlotCounts`). */
export const SLOT_TYPES = ['ci', 'workspace', 'desk', 'agent'] as const;

/** A slot type a target serves. */
export type SlotType = (typeof SLOT_TYPES)[number];

/** One slot type's line on a target's card: used, reserved, and the ceiling (`—`: none). */
export interface SlotLine {
  readonly type: SlotType;
  readonly used: number;
  readonly reserved: number;
  readonly maximum: string;
}

/** A target's slot types, each with its use, reservation and ceiling (`—` when it has none). */
export function slotLines(row: Pick<TargetRow, 'used' | 'reservations' | 'maximums'>): SlotLine[] {
  return SLOT_TYPES.map((type) => {
    const maximum = row.maximums?.[type];
    return {
      type,
      used: row.used?.[type] ?? 0,
      reserved: row.reservations?.[type] ?? 0,
      maximum: maximum === null || maximum === undefined ? '—' : `${maximum}`,
    };
  });
}

/** `2/6 slots in use`: every type's use against the total the runner reports. */
export function slotsInUse(row: Pick<TargetRow, 'used' | 'slotsTotal'>): string {
  const used = SLOT_TYPES.reduce((sum, type) => sum + (row.used?.[type] ?? 0), 0);
  return `${used}/${row.slotsTotal ?? 0} slots in use`;
}

/** A harness's sign-in on the target, as qits-system answers it: PRESENT, ABSENT or UNKNOWN. */
export function loginOf(row: Pick<TargetRow, 'login'>, harness: string): string {
  const login = row.login as Readonly<Record<string, string | undefined>> | undefined;
  return login?.[harness] ?? 'UNKNOWN';
}

/** A sign-in's chip tone: PRESENT ok, ABSENT failed, anything else waiting. */
export function loginTone(login: string): ChipTone {
  if (login === 'PRESENT') return 'ok';
  if (login === 'ABSENT') return 'failed';
  return 'waiting';
}

/** A harness's manual sign-in command: `loginCommand` for claude, `kimiLoginCommand` for kimi. */
export function loginCommandOf(
  row: Pick<TargetRow, 'loginCommand' | 'kimiLoginCommand'>,
  harness: string,
): string | undefined {
  const command = harness === 'kimi' ? row.kimiLoginCommand : row.loginCommand;
  return command ?? undefined;
}

/**
 * The node's memory, one line, or undefined while the runner reported nothing
 * (`memory` null, or every figure null): `2 OOM kills on the node · 5 on the host · limit 8.00 GiB`.
 */
export function memoryLine(row: Pick<TargetRow, 'memory'>): string | undefined {
  const memory = row.memory;
  if (!memory) return undefined;
  const parts: string[] = [];
  const kills = (count: number) => (count === 1 ? '1 OOM kill' : `${count} OOM kills`);
  if (typeof memory.nodeOomKills === 'number')
    parts.push(`${kills(memory.nodeOomKills)} on the node`);
  if (typeof memory.kernelOomKills === 'number') {
    parts.push(`${kills(memory.kernelOomKills)} on the host`);
  }
  if (typeof memory.memoryMaxBytes === 'number') {
    parts.push(`limit ${formatBytes(memory.memoryMaxBytes)}`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * A reservation typed into a form: a whole number from 0 to 1024, else undefined (the form says
 * so and sends nothing). An empty field is 0.
 */
export function slotCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const count = Number(trimmed);
  return count <= 1024 ? count : undefined;
}

/**
 * An optional slots total typed into a form: undefined for an empty field (the service decides),
 * the number when it is a whole number from 0 to 1024, else `false` (the form says so).
 */
export function optionalSlots(value: string): number | undefined | false {
  if (value.trim() === '') return undefined;
  return slotCount(value) ?? false;
}

/** What a target's Edit holds: its description and each type's reservation, as typed. */
export interface TargetDraft {
  readonly description: string;
  readonly reservations: Readonly<Record<SlotType, string>>;
}

/** The Edit a target opens with: what it has now. */
export function draftOf(row: Pick<TargetRow, 'description' | 'reservations'>): TargetDraft {
  return {
    description: row.description ?? '',
    reservations: Object.fromEntries(
      SLOT_TYPES.map((type) => [type, `${row.reservations?.[type] ?? 0}`]),
    ) as Record<SlotType, string>,
  };
}

/** A `patchTarget` body: only what changed (absent fields and members leave theirs). */
export interface TargetPatch {
  readonly description?: string;
  readonly reservations?: Partial<Record<SlotType, number>>;
}

/**
 * What Save sends (qits-2351): the description when it changed, and only the reservations that
 * changed, as qits-system reads a patch (an absent field or member leaves its value). `false`
 * when a reservation is not a whole number from 0 to 1024 (the card says so and sends nothing),
 * undefined when nothing changed.
 */
export function targetPatch(
  row: Pick<TargetRow, 'description' | 'reservations'>,
  draft: TargetDraft,
): TargetPatch | undefined | false {
  const reservations: Partial<Record<SlotType, number>> = {};
  for (const type of SLOT_TYPES) {
    const count = slotCount(draft.reservations[type]);
    if (count === undefined) return false;
    if (count !== (row.reservations?.[type] ?? 0)) reservations[type] = count;
  }
  const description = draft.description !== (row.description ?? '') ? draft.description : undefined;
  const changed = Object.keys(reservations).length > 0;
  if (description === undefined && !changed) return undefined;
  return {
    ...(description === undefined ? {} : { description }),
    ...(changed ? { reservations } : {}),
  };
}
