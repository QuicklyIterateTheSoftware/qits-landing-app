/**
 * The data marks (qits-2141) of one value a component is handed already computed (a fact row's
 * value, a page title, a folder's name): the `data-qits-source`, `data-qits-item`,
 * `data-qits-field` and `data-qits-derived` attribute values of the read, the record and the field
 * it shows. `qits/data-through-fields` cannot trace a value handed in as text, so the code that
 * builds it from the record makes its marks too (`valueMarks` in `$core/marks/value-marks`) and the
 * component only sets them, as plain attributes on the element showing the value (qits-2146).
 */
export interface ValueMarks {
  readonly source: string;
  readonly item: string | null;
  readonly field?: string;
  readonly derived?: string;
}
