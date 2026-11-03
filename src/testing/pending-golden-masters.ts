import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectsGoldenMasters } from './golden-masters';

/**
 * qits-projects' milestone recordings (epic qits-615) for the plain specs, while the installed
 * `@qits/projects-golden-masters` does not carry them yet.
 *
 * The three provider states "a ticket waiting on an unmet milestone", "a ticket waiting on a met
 * milestone" and "a campaign member waiting on a milestone" are committed on qits-projects-service's
 * `epic/qits-615` branch (`golden-masters/`, at c4943945) and reach the npm package only with the
 * release that carries them; qits-maintenance then bumps the devDependency. `pending-golden-masters/`
 * holds copies of those three states' files and their index entries (as prettier formats them).
 *
 * {@link pendingGoldenMaster} reads the installed package first, so once the pin carries a state
 * the specs answer with the published recording and these copies are dead weight: delete this file
 * and the directory, and read `goldenMaster` instead. The pact specs never read these copies: their
 * interactions for the new operations are skipped until the package records them.
 */
const DIR = resolve(process.cwd(), 'src/testing/pending-golden-masters/qits-projects');

interface IndexEntry {
  readonly name: string;
  readonly slug: string;
  readonly params: Readonly<Record<string, string>>;
  readonly operations: readonly { readonly operationId: string; readonly file: string }[];
}

let index: readonly IndexEntry[] | undefined;
const entries = (): readonly IndexEntry[] =>
  (index ??= (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as { states: IndexEntry[] })
    .states);

/** Whether the installed `@qits/projects-golden-masters` records `operationId` in `state`. */
export function published(state: string, operationId: string): boolean {
  try {
    projectsGoldenMasters.operation(state, operationId);
    return true;
  } catch {
    return false;
  }
}

/** The body qits-projects recorded for `operationId` in `state`: the package's, else the copy's. */
export function pendingGoldenMaster<T = any>(state: string, operationId: string): T {
  if (published(state, operationId)) return projectsGoldenMasters.body<T>(state, operationId);
  const entry = entries().find((s) => s.name === state);
  const op = entry?.operations.find((o) => o.operationId === operationId);
  if (!op) throw new Error(`no pending recording of '${operationId}' in state '${state}'`);
  return JSON.parse(readFileSync(join(DIR, op.file), 'utf8')) as T;
}

/** The state's params (its ids), as the recording's index names them. */
export function pendingParams(state: string): Readonly<Record<string, string>> {
  const entry = entries().find((s) => s.name === state);
  if (!entry) throw new Error(`no pending state '${state}'`);
  return entry.params;
}
