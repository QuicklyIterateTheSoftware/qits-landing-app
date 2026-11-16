import { itemMark } from '@qits/angular';
import { CONTRACTS_MARKS } from '$core/contracts/contracts-marks';
import type { Freeze, ManifestRoute } from './routes-manifest';

/**
 * The data marks (qits-2141) of what the UI builder shows of the published docs files it reads
 * (qits-2220): the routes bundle's `manifest.json` (`RoutesBundles`) and the services'
 * `entities.json` (`ContractsCatalog`), both through `getDocsFile`, which `qits/data-through-fields`
 * cannot trace through those root services, so the template writes the marks as plain attributes,
 * as the contracts pages do (`CONTRACTS_MARKS`). Over a docs file, the source is the file read
 * (`data-qits-source`), the item an entry by its key in that file as the file keys it (a manifest
 * route by its `routes[].fullPath`, a freeze by its `freezes[].file`, a mapped entity by its
 * `entities[].entity`), and a field or derived path the JSON path inside that entry; a value
 * counted over the file is derived from its top-level key (`routes`, `freezes`, `entities`). The
 * bundle's version and the file's path are not in the mark, as on the contracts pages.
 */
export const BUILDER_MARKS = {
  /** `sourceMark(DOCS_FILE)`, written out: the template binds it as a constant. */
  source: CONTRACTS_MARKS.source,
  route: (route: Pick<ManifestRoute, 'fullPath'>): string | null =>
    itemMark('fullPath', route.fullPath),
  freeze: (freeze: Pick<Freeze, 'file'>): string | null => itemMark('file', freeze.file),
  entity: CONTRACTS_MARKS.entity,
} as const;
