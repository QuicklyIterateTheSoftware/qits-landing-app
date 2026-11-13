import { itemMark } from '@qits/angular';
import type { GoldenState } from '$core/ui-builder/golden-masters';
import type { MappedEntity } from '$core/ui-builder/entity-map';

/**
 * The data marks (qits-2141) of what the contracts and entities pages show of a published bundle
 * (qits-2146). They read its files through `getDocsFile` (`DOCS_FILE`) and draw rows computed from
 * them (`contracts-view.ts`), which `qits/data-through-fields` cannot trace, so the templates write
 * the marks as plain attributes, as the shell does for its shared data: the element listing the
 * file's records names the read (`data-qits-source`), each row its record (`data-qits-item`), each
 * value the record's field (`data-qits-field`) or the fields it is computed from
 * (`data-qits-derived`). A golden-master state is keyed by its `slug`, a mapped entity by its
 * `entity` (its fully qualified class name), as the files key them.
 */
export const CONTRACTS_MARKS = {
  /** `sourceMark(DOCS_FILE)`, written out: the templates bind it as a constant. */
  source: 'qits-artifacts-service#getDocsFile',
  state: (state: Pick<GoldenState, 'slug'>): string | null => itemMark('slug', state.slug),
  entity: (entity: Pick<MappedEntity, 'entity'>): string | null =>
    itemMark('entity', entity.entity),
} as const;
