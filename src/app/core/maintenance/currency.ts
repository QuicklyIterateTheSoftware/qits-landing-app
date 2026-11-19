/**
 * How a dependent's embedded copy of an artifact stands against that artifact's latest version
 * (qits-2330's Artifacts page, qits-2334's repository page).
 */
export type Currency = 'current' | 'behind' | 'unknown';

/**
 * How `embedded` stands against `latest`: current when equal, behind when not, unknown when the
 * latest is (the old frontend's `currencyOf`, `dependents-table.ts`).
 */
export function currencyOf(
  embedded: string | null | undefined,
  latest: string | null | undefined,
): Currency {
  if (!latest) return 'unknown';
  return embedded === latest ? 'current' : 'behind';
}
