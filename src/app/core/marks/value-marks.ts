import {
  itemMark,
  sourceMark,
  type QitsFieldMark,
  type QitsOperationIdentity,
} from '@qits/angular';

import type { ValueMarks } from '$ui/dom/value-marks';

export type { ValueMarks };

/** A read: an operation, or its {@link sourceMark} already made. */
export type MarkSource = Pick<QitsOperationIdentity, 'provider' | 'operationId'> | string;

/**
 * The marks of a value shown from `record` (identified by its `key` field), read by `source`: `mark`
 * is the field shown as is, or `{ derived: [...] }`, the fields it is computed from — checked
 * against the record's type, as `QitsField` checks it.
 */
export function valueMarks<T extends object>(
  source: MarkSource,
  record: T,
  key: keyof T & string,
  mark: QitsFieldMark<T>,
): ValueMarks {
  const marks = {
    source: typeof source === 'string' ? source : sourceMark(source),
    item: itemMark(key, record[key]),
  };
  return typeof mark === 'string'
    ? { ...marks, field: mark }
    : { ...marks, derived: [...new Set<string>(mark.derived)].join(' ') };
}
