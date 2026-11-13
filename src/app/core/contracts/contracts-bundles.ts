import { effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';
import type { ContractsSite } from '$core/ui-builder/contracts-catalog';
import { DOCS_REPOSITORY } from '$core/ui-builder/docs.consumes';
import { DOCS_FILE } from '$core/ui-builder/docs.operations';
import {
  asGoldenIndex,
  GOLDEN_INDEX_FILE,
  recordedFilePath,
  safeRecordedFile,
  type GoldenIndex,
  type GoldenOperation,
} from '$core/ui-builder/golden-masters';
import { isMissing, ResourceFamily } from '$core/resources/resource-family';
import {
  asDatabaseIndex,
  mermaidOf,
  tableOf,
  unitOf,
  type DatabaseIndex,
} from './database-diagram';

/** The ER diagrams' index in a contracts site's version (qits-2014). */
const DATABASE_INDEX = 'database/index.json';

/**
 * Asks Angular's `HttpRequest` for the body as text, not JSON (the diagrams are `text/markdown`).
 * The generated options do not name `responseType`, but the client hands every option to the
 * request's init, which reads it.
 */
const AS_TEXT = { responseType: 'text' } as const;

/** One bundle's `golden-masters/index.json`. */
export type GoldenIndexRead =
  | { readonly status: 'loading' }
  /** Unreadable, or not an index. */
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly index: GoldenIndex };

/** One recorded response. */
export type RecordingRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** The index records no file (a byte answer), the answer has no body, or it is not JSON. */
  | { readonly status: 'none' }
  /** Pretty-printed JSON. */
  | { readonly status: 'loaded'; readonly json: string };

/** One recorded response as its parsed answer (qits-2144). */
export type RecordedAnswerRead =
  | { readonly status: 'loading' }
  /** `body` is the recorded JSON; null when there is none. */
  | { readonly status: 'loaded'; readonly body: unknown };

const NO_ANSWER: RecordedAnswerRead = { status: 'loaded', body: null };

/** The ER diagram of the persistence unit holding one entity (qits-2014). */
export type DiagramRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /**
   * The version publishes no `database/index.json` or no such diagram (a 404), or no unit holds
   * the entity: no diagram published, not an error.
   */
  | { readonly status: 'none' }
  /**
   * `definition` is the mermaid block's body, without the fence; `table` is the entity's own table
   * as the index names it (null when it names none), which the diagram draws as one of its boxes.
   */
  | {
      readonly status: 'loaded';
      readonly unit: string;
      readonly table: string | null;
      readonly definition: string;
    };

const fileKey = ({ site, version }: ContractsSite, path: string) => `${site}@${version}/${path}`;
const diagramKey = ({ site, version }: ContractsSite, entity: string) =>
  `${site}@${version}#${entity}`;

/** A recorded response, pretty-printed. */
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * A repository's contracts bundle (qits-1994, qits-1999): the provider states a service's
 * `@contracts/<application>` docs site publishes, their recorded responses, and its ER diagrams. A
 * root service holding one `qitsResource` per file over `DOCS_FILE` (qits-2146; it was
 * `ContractsBundleStore` and `golden-masters.store.ts`'s reads), shared by a repository's
 * contracts and entities pages and the UI builder's call popover. Which site is the repository's,
 * and its `entities.json`, come from `ContractsCatalog`.
 *
 * - `readIndex(site)` reads the version's `golden-masters/index.json`, checked by `asGoldenIndex`.
 * - `readRecording(site, operation)` reads one recorded response, never a file outside the index's
 *   own tree (`recordedFilePath`, `safeRecordedFile`) nor one the index records none for (a byte
 *   answer, qits-1934), nor a 204's.
 * - `readDiagram(site, entity)` (qits-2014) reads the version's `database/index.json` (once per
 *   version), finds the unit whose `entities[].entity` is `entity` (`unitOf`), reads that unit's
 *   `database/<file>` as text and keeps its fenced mermaid block (`mermaidOf`). A 404 on either
 *   file, or no unit holding the entity, is `none`; a file that is not an index, or a diagram file
 *   without a mermaid block, is `error`.
 *
 * Every read is `getDocsFile` of qits-artifacts' docs store, in the browser only (the pages and the
 * popover ask from the browser). A failed read is read again on the next ask.
 *
 * Staleness (qits-1270): none. All are keyed by site and version, and a published version never
 * changes; a newer version is a new catalog entry, which `ContractsCatalog` reads again.
 */
@Injectable({ providedIn: 'root' })
export class ContractsBundles {
  /** Every file read, by `fileKey`. */
  private readonly files = new ResourceFamily(DOCS_FILE, inject(Injector));

  /** The diagrams asked for, by `diagramKey`. */
  private readonly diagrams = signal<ReadonlyMap<string, { site: ContractsSite; entity: string }>>(
    new Map(),
  );

  /** Each published file checked once per check, by the answer it was read from. */
  private readonly checked = new Map<(value: unknown) => unknown, WeakMap<object, unknown>>();

  constructor() {
    // A diagram's file, read once its unit's index names it.
    effect(() => {
      for (const { site, entity } of this.diagrams().values()) {
        const file = this.unitFile(site, entity);
        if (file) untracked(() => this.readFile(site, file, true));
      }
    });
  }

  /** Starts reading the site's index, unless held (again after an error). */
  readIndex(site: ContractsSite): void {
    this.readFile(site, GOLDEN_INDEX_FILE, false, true);
  }

  /** What is held for the site's index. */
  indexRead(site: ContractsSite): GoldenIndexRead | undefined {
    const read = this.files.get(fileKey(site, GOLDEN_INDEX_FILE));
    if (!read) return undefined;
    if (read.hasValue()) {
      const index = this.check(read.value(), asGoldenIndex);
      return index ? { status: 'loaded', index } : { status: 'error' };
    }
    return read.status() === 'error' ? { status: 'error' } : { status: 'loading' };
  }

  /**
   * Starts reading one recorded response, unless held (again after an error). An operation
   * without a file, answered 204 No Content (its file holds `null`), or naming a file outside the
   * index's tree is not read.
   */
  readRecording(site: ContractsSite, op: GoldenOperation): void {
    const path = recordedFilePath(op);
    if (path && op.status !== 204) this.readFile(site, path, false, true);
  }

  /** What is held for one recorded response. */
  recordingRead(site: ContractsSite, op: GoldenOperation): RecordingRead | undefined {
    if (op.file === null || op.status === 204) return { status: 'none' };
    const path = recordedFilePath(op);
    if (!path) return { status: 'error' };
    const read = this.files.get(fileKey(site, path));
    if (!read) return undefined;
    if (!read.hasValue())
      return read.status() === 'error' ? { status: 'error' } : { status: 'loading' };
    const body = read.value();
    if (body === null || body === undefined) return { status: 'error' };
    if (typeof body !== 'object') return { status: 'none' };
    return { status: 'loaded', json: this.check(body, pretty) };
  }

  /**
   * One recorded response as the parsed answer (qits-2144: the UI builder's "Selected data" reads
   * its values), from the same read as `recordingRead`. Null when there is none: the index records
   * no file (a byte answer), it names one outside its tree, a 204's, a failed read, or a body that
   * is not JSON. Undefined until `readRecording` started it.
   */
  recordedAnswer(site: ContractsSite, op: GoldenOperation): RecordedAnswerRead | undefined {
    if (op.file === null || op.status === 204) return NO_ANSWER;
    const path = recordedFilePath(op);
    if (!path) return NO_ANSWER;
    const read = this.files.get(fileKey(site, path));
    if (!read) return undefined;
    if (!read.hasValue()) return read.status() === 'error' ? NO_ANSWER : { status: 'loading' };
    const body: unknown = read.value();
    return body === undefined || typeof body === 'string' ? NO_ANSWER : { status: 'loaded', body };
  }

  /** Starts reading the ER diagram of `entity`'s unit, unless held (again after an error). */
  readDiagram(site: ContractsSite, entity: string): void {
    this.readFile(site, DATABASE_INDEX);
    const key = diagramKey(site, entity);
    if (!untracked(this.diagrams).has(key)) {
      this.diagrams.update((diagrams) => new Map(diagrams).set(key, { site, entity }));
    }
    const file = untracked(() => this.unitFile(site, entity));
    if (file) this.readFile(site, file, true);
  }

  /** What is held for the ER diagram of `entity`'s unit. */
  diagramRead(site: ContractsSite, entity: string): DiagramRead | undefined {
    if (!this.diagrams().has(diagramKey(site, entity))) return undefined;
    const index = this.databaseIndex(site);
    if (index === 'loading' || index === 'none' || index === 'error') {
      return { status: index };
    }
    const unit = unitOf(index, entity);
    if (!unit) return { status: 'none' };
    if (!safeRecordedFile(unit.file)) return { status: 'error' };
    const read = this.files.get(fileKey(site, `database/${unit.file}`));
    if (!read || (!read.hasValue() && read.status() !== 'error')) return { status: 'loading' };
    if (!read.hasValue()) return { status: isMissing(read) ? 'none' : 'error' };
    const markdown: unknown = read.value();
    const definition = typeof markdown === 'string' ? mermaidOf(markdown) : null;
    return definition === null
      ? { status: 'error' }
      : { status: 'loaded', unit: unit.unit, table: tableOf(unit, entity), definition };
  }

  /** The version's database index, or where its read stands. */
  private databaseIndex(site: ContractsSite): DatabaseIndex | 'loading' | 'none' | 'error' {
    const read = this.files.get(fileKey(site, DATABASE_INDEX));
    if (!read || (!read.hasValue() && read.status() !== 'error')) return 'loading';
    if (!read.hasValue()) return isMissing(read) ? 'none' : 'error';
    return this.check(read.value(), asDatabaseIndex) ?? 'error';
  }

  /** The diagram file of `entity`'s unit, once the index names a safe one. */
  private unitFile(site: ContractsSite, entity: string): string | null {
    const index = this.databaseIndex(site);
    if (typeof index === 'string') return null;
    const unit = unitOf(index, entity);
    return unit && safeRecordedFile(unit.file) ? `database/${unit.file}` : null;
  }

  /**
   * Starts reading `path` of the site's version (as text when `text`), unless held; again after a
   * failure, after a 404 too when `retryMissing` (a 404 is no file published, for a diagram).
   */
  private readFile(site: ContractsSite, path: string, text = false, retryMissing = false): void {
    this.files.read(
      fileKey(site, path),
      {
        path: { repository: DOCS_REPOSITORY, site: site.site, version: site.version, path },
        ...(text ? AS_TEXT : {}),
      },
      retryMissing,
    );
  }

  /** `check(value)`, once per answer. */
  private check<T>(value: unknown, check: (value: unknown) => T): T {
    if (!value || typeof value !== 'object') return check(value);
    let done = this.checked.get(check);
    if (!done) this.checked.set(check, (done = new WeakMap()));
    if (!done.has(value)) done.set(value, check(value));
    return done.get(value) as T;
  }
}
