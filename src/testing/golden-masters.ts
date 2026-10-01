/**
 * qits-projects' recorded answers, as this app's specs consume them (epic qits-546).
 *
 * qits-projects records what it answers in each provider state, as `golden-masters/index.json`
 * plus one JSON per (state, operation), and publishes the tree as the npm package
 * `@qits/projects-golden-masters`. It is a devDependency here, so qits-maintenance bumps it. This
 * file reads it from `node_modules` and offers it two ways:
 *
 * - {@link goldenMaster}: the recorded body, for a spec to `flush(...)` instead of a hand-written one;
 * - {@link interaction}: a Pact V4 interaction for the same (state, operation), with matchers taken
 *   from the index's `frozen` lists. `qits-projects.pact.spec.ts` collects them and
 *   {@link assertPactFile} writes `pacts/qits-landing-qits-projects.json`.
 *
 * NO PACT NATIVE CORE: this file writes the V4 JSON itself (see AGENTS.md, "Pact"). The layout is
 * the one pact-jvm writes for qits-workspaces' consumer pact, because pact-jvm is what verifies it.
 *
 * THE FROZEN LISTS ARE READ FROM THE INDEX, NEVER INFERRED FROM A VALUE'S SHAPE. A string that looks
 * like a UUID is still type-matched unless the recorder listed its path under `frozen.ids`:
 *
 * - `frozen.ids`: the whole value is a UUID, a regex matcher;
 * - `frozen.instants`: an ISO-8601 timestamp, a regex matcher ({@link ISO_INSTANT});
 * - `frozen.strings`: a string that carries a frozen value, a type match;
 * - `frozen.listFilteredTo`: the array the recorder cut down to the state's own entities, a type
 *   match with `min` = the recorded length ("contains", never "equals");
 * - every other leaf: a type match. A leaf that is null in EVERY recorded element (`backupUrl`) has
 *   no rule and is compared as exactly `null`. This is what the JVM consumer does too. Such a leaf
 *   says nothing about its type, and a type rule on a `null` example would accept only `null`
 *   anyway.
 *
 * Every other non-empty array is a type match with `min` = `max` = the recorded length: exactly that
 * many elements, each matched against ONE template, so the contract does not depend on element
 * order. qits-projects does not guarantee that order. The template MERGES every recorded element: a
 * leaf that is null in one element and a string in another becomes `type OR null`, so a nullable
 * field such as `component` matches in any position. Unknown `frozen` keys are ignored.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { InteractionSlug } from '../app/interactions';

/** The consumer and the provider, as the pact names them: the deployed application names. */
export const CONSUMER = 'qits-landing';
export const PROVIDER = 'qits-projects';

/** The package, and where the tree sits in it. */
const PACKAGE = '@qits/projects-golden-masters';
const TREE = 'golden-masters';

/** The committed pact, relative to the repository root. */
export const PACT_FILE = `pacts/${CONSUMER}-${PROVIDER}.json`;

/** The switch that rewrites the pact file instead of comparing it. */
export const UPDATE_SWITCH = 'QITS_GOLDEN_UPDATE';

/** pact-jvm's own uuid regex, which its `uuid()` DSL writes. The JVM consumer's file carries it. */
const UUID_REGEX = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The anchored uuid regex the JVM consumer uses inside an `OR null`. */
const UUID_REGEX_ANCHORED =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** An ISO-8601 timestamp, any fraction length, Z or a numeric offset. */
export const ISO_INSTANT =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,9})?)?(Z|[+-]\\d{2}:?\\d{2})$';

// --- the index -------------------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One recorded (state, operation), as the index describes it. */
export interface GoldenOperation {
  readonly state: string;
  readonly params: Readonly<Record<string, string>>;
  readonly operationId: string;
  readonly method: string;
  /** The template, with `{param}` keys of `params`. */
  readonly path: string;
  readonly status: number;
  readonly file: string;
  readonly ids: ReadonlySet<string>;
  readonly instants: ReadonlySet<string>;
  readonly strings: ReadonlySet<string>;
  readonly listFilteredTo: string | null;
}

interface IndexOperation {
  operationId: string;
  method: string;
  path: string;
  status: number;
  file: string;
  frozen?: {
    ids?: string[];
    instants?: string[];
    strings?: string[];
    listFilteredTo?: string | null;
    [unknown: string]: unknown;
  };
}

interface IndexState {
  name: string;
  slug: string;
  params?: Record<string, string>;
  operations: IndexOperation[];
}

interface Index {
  formatVersion: number;
  provider: string;
  states: IndexState[];
}

let treeRoot: string | undefined;
let index: Index | undefined;

/** `node_modules/@qits/projects-golden-masters/golden-masters`, found upwards from the cwd. */
function root(): string {
  if (treeRoot) return treeRoot;
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, 'node_modules', PACKAGE, TREE);
    if (existsSync(join(candidate, 'index.json'))) return (treeRoot = candidate);
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `no ${PACKAGE} in any node_modules above ${process.cwd()}: run npm ci (it is a devDependency)`,
      );
    }
    dir = parent;
  }
}

function readIndex(): Index {
  if (index) return index;
  const loaded = JSON.parse(readFileSync(join(root(), 'index.json'), 'utf8')) as Index;
  if (loaded.formatVersion !== 1) {
    throw new Error(`${TREE}/index.json is formatVersion ${loaded.formatVersion}; this reads 1`);
  }
  if (loaded.provider !== PROVIDER) {
    throw new Error(`${TREE}/index.json is ${loaded.provider}'s, not ${PROVIDER}'s`);
  }
  return (index = loaded);
}

/** The index entry for one (state, operation); throws naming both when the index has none. */
export function goldenOperation(state: string, operationId: string): GoldenOperation {
  const node = readIndex().states.find((s) => s.name === state);
  if (!node) throw new Error(`${PROVIDER}'s golden masters record no state '${state}'`);
  const op = node.operations.find((o) => o.operationId === operationId);
  if (!op) {
    throw new Error(`${PROVIDER}'s golden masters record no '${operationId}' in state '${state}'`);
  }
  const frozen = op.frozen ?? {};
  return {
    state,
    params: { ...(node.params ?? {}) },
    operationId,
    method: op.method,
    path: op.path,
    status: op.status,
    file: op.file,
    ids: new Set(frozen.ids ?? []),
    instants: new Set(frozen.instants ?? []),
    strings: new Set(frozen.strings ?? []),
    listFilteredTo: frozen.listFilteredTo ?? null,
  };
}

/** The path with every `{param}` replaced by the state's example: what the app really requests. */
export function examplePath(op: GoldenOperation): string {
  return op.path.replace(/\{([A-Za-z0-9_]+)}/g, (_, name: string) => {
    const value = op.params[name];
    if (value === undefined) {
      throw new Error(`state '${op.state}' has no param '${name}' for ${op.path}`);
    }
    return value;
  });
}

/**
 * The body qits-projects recorded for `operationId` in `state`, for a spec to `flush(...)`. A fresh
 * copy every call, so a spec may derive from it freely.
 */
export function goldenMaster<T = any>(state: string, operationId: string): T {
  const op = goldenOperation(state, operationId);
  return JSON.parse(readFileSync(join(root(), op.file), 'utf8')) as T;
}

// --- the interaction -------------------------------------------------------------------------------

/** A Pact V4 matching rule, as pact-jvm writes it. */
interface Rule {
  combine: 'AND' | 'OR';
  matchers: Record<string, string | number>[];
}

/** A Pact V4 `Synchronous/HTTP` interaction, as this file writes it. */
export interface PactInteraction {
  readonly description: string;
  readonly state: string;
  readonly json: Json;
}

/** The interaction's description: the trigger first, so (description, state) stays unique. */
export function description(operationId: string, trigger: InteractionSlug): string {
  return `${trigger}: ${operationId}`;
}

/**
 * The Pact V4 interaction for (`state`, `operationId`), triggered by the UI interaction `trigger`:
 * the provider state and its params; the path from the state (`ProviderState` generator, only when
 * the path has a `{param}` — pact-jvm resolves a parameterless expression to a path that misses the
 * route); the exact status; the body under matchers (see the file comment); and `comments.references`.
 */
export function interaction(
  state: string,
  operationId: string,
  trigger: InteractionSlug,
): PactInteraction {
  const op = goldenOperation(state, operationId);
  const recorded = goldenMaster<Json>(state, operationId);
  if (recorded === null || typeof recorded !== 'object' || Array.isArray(recorded)) {
    throw unsupported(op, '$', 'not an object body');
  }
  const rules: Record<string, Rule> = {};
  const content = build(shapeOf(recorded), '$', op, rules);
  const parameterised = /\{[A-Za-z0-9_]+}/.test(op.path);
  const json: Json = {
    comments: {
      references: {
        'qits-call': { app: PROVIDER, operationId },
        'qits-trigger': { kind: 'ui', app: CONSUMER, interaction: trigger },
      },
    },
    description: description(operationId, trigger),
    pending: false,
    providerStates: [{ name: state, params: { ...op.params } }],
    request: {
      ...(parameterised
        ? {
            generators: {
              path: {
                type: 'ProviderState',
                expression: op.path.replace(/\{([A-Za-z0-9_]+)}/g, '$${$1}'),
                dataType: 'RAW',
              },
            },
          }
        : {}),
      method: op.method,
      path: examplePath(op),
    },
    response: {
      body: { content, contentType: 'application/json', encoded: false },
      headers: { 'Content-Type': ['application/json'] },
      matchingRules: {
        ...(Object.keys(rules).length ? { body: rules as unknown as Json } : {}),
        header: {
          'Content-Type': {
            combine: 'AND',
            matchers: [{ match: 'regex', regex: 'application/json.*' }],
          },
        },
      },
      status: op.status,
    },
    type: 'Synchronous/HTTP',
  };
  return { description: description(operationId, trigger), state, json };
}

/**
 * The structure of a recorded value, with an array's elements MERGED into one template: the union
 * of fields, a leaf's first non-null example, and `nullable` wherever an element held null or
 * lacked the field.
 */
type Shape =
  | { kind: 'null'; nullable: true }
  | { kind: 'leaf'; nullable: boolean; example: string | number | boolean }
  | { kind: 'object'; nullable: boolean; fields: Map<string, Shape> }
  | { kind: 'array'; nullable: boolean; length: number; element: Shape | undefined };

function shapeOf(value: Json | undefined): Shape {
  if (value === null || value === undefined) return { kind: 'null', nullable: true };
  if (Array.isArray(value)) {
    let element: Shape | undefined;
    for (const item of value) element = element ? merge(element, shapeOf(item)) : shapeOf(item);
    return { kind: 'array', nullable: false, length: value.length, element };
  }
  if (typeof value === 'object') {
    const fields = new Map<string, Shape>();
    for (const [key, child] of Object.entries(value)) fields.set(key, shapeOf(child));
    return { kind: 'object', nullable: false, fields };
  }
  return { kind: 'leaf', nullable: false, example: value };
}

function merge(a: Shape, b: Shape): Shape {
  if (a.kind === 'null') return { ...b, nullable: true } as Shape;
  if (b.kind === 'null') return { ...a, nullable: true } as Shape;
  if (a.kind !== b.kind)
    throw new Error(`golden master array elements disagree: ${a.kind}, ${b.kind}`);
  const nullable = a.nullable || b.nullable;
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map<string, Shape>();
    for (const key of new Set([...a.fields.keys(), ...b.fields.keys()])) {
      fields.set(
        key,
        merge(a.fields.get(key) ?? shapeOf(null), b.fields.get(key) ?? shapeOf(null)),
      );
    }
    return { kind: 'object', nullable, fields };
  }
  if (a.kind === 'array' && b.kind === 'array') {
    const element = !a.element ? b.element : !b.element ? a.element : merge(a.element, b.element);
    return { kind: 'array', nullable, length: Math.min(a.length, b.length), element };
  }
  // Two leaves: keep a's example; the matcher is a type match, so one example stands for all.
  return { ...a, nullable } as Shape;
}

const and = (...matchers: Rule['matchers']): Rule => ({ combine: 'AND', matchers });
const or = (...matchers: Rule['matchers']): Rule => ({ combine: 'OR', matchers });

/** The example content for `shape` at `path`, recording each matcher into `rules`. */
function build(shape: Shape, path: string, op: GoldenOperation, rules: Record<string, Rule>): Json {
  switch (shape.kind) {
    case 'null':
      // Null in every recorded element: no rule, so the provider must answer exactly null.
      return null;
    case 'leaf':
      rules[path] = leafRule(shape, path, op);
      return shape.example;
    case 'object': {
      if (shape.nullable) throw unsupported(op, path, 'an object that is null in some elements');
      const out: { [key: string]: Json } = {};
      for (const [key, child] of shape.fields) out[key] = build(child, `${path}.${key}`, op, rules);
      return out;
    }
    case 'array': {
      if (shape.nullable) throw unsupported(op, path, 'an array that is null in some elements');
      const n = shape.length;
      // Nothing to build a template from: an empty array with no rule is compared as exactly that.
      if (n === 0 || !shape.element) return [];
      if (shape.element.kind !== 'object' && shape.element.kind !== 'leaf') {
        throw unsupported(op, `${path}[*]`, `an array of ${shape.element.kind}`);
      }
      if (shape.element.kind === 'leaf' && shape.element.nullable) {
        throw unsupported(op, `${path}[*]`, 'an array holding nulls');
      }
      const filtered = path === op.listFilteredTo;
      rules[path] = and(filtered ? { match: 'type', min: n } : { match: 'type', min: n, max: n });
      const template = build(shape.element, `${path}[*]`, op, rules);
      return Array.from({ length: n }, () => structuredClone(template));
    }
  }
}

function leafRule(leaf: Extract<Shape, { kind: 'leaf' }>, path: string, op: GoldenOperation): Rule {
  const text = (list: string) => {
    if (typeof leaf.example !== 'string') {
      throw new Error(
        `golden master ${op.state}/${op.operationId}: frozen.${list} names ${path}, which holds ` +
          `${typeof leaf.example}, not a string`,
      );
    }
  };
  if (op.ids.has(path)) {
    text('ids');
    return leaf.nullable
      ? or({ match: 'regex', regex: UUID_REGEX_ANCHORED }, { match: 'null' })
      : and({ match: 'regex', regex: UUID_REGEX });
  }
  if (op.instants.has(path)) {
    text('instants');
    return leaf.nullable
      ? or({ match: 'regex', regex: ISO_INSTANT }, { match: 'null' })
      : and({ match: 'regex', regex: ISO_INSTANT });
  }
  // frozen.strings or an ordinary leaf: a type match, widened to null where a sibling had null.
  if (leaf.nullable) return or({ match: 'type' }, { match: 'null' });
  return and(typeof leaf.example === 'number' ? { match: 'number' } : { match: 'type' });
}

function unsupported(op: GoldenOperation, path: string, what: string): Error {
  return new Error(
    `golden master ${op.state}/${op.operationId}: ${path} is ${what}, which this helper cannot ` +
      'express as a pact matcher yet',
  );
}

// --- the pact file ---------------------------------------------------------------------------------

/** Every object's keys in byte order, recursively: the file does not depend on insertion order. */
function sorted(value: Json): Json {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== 'object') return value;
  const out: { [key: string]: Json } = {};
  for (const key of Object.keys(value).sort()) out[key] = sorted(value[key]);
  return out;
}

/** The pact document for `interactions`, sorted by description then state, 2-space, newline. */
export function pactDocument(interactions: readonly PactInteraction[]): string {
  const seen = new Set<string>();
  for (const i of interactions) {
    const key = `${i.description}\u0000${i.state}`;
    if (seen.has(key)) throw new Error(`two interactions '${i.description}' in state '${i.state}'`);
    seen.add(key);
  }
  const ordered = [...interactions].sort(
    (a, b) =>
      (a.description < b.description ? -1 : a.description > b.description ? 1 : 0) ||
      (a.state < b.state ? -1 : a.state > b.state ? 1 : 0),
  );
  const pact: Json = {
    consumer: { name: CONSUMER },
    interactions: ordered.map((i) => i.json),
    metadata: { pactSpecification: { version: '4.0' }, plugins: [] },
    provider: { name: PROVIDER },
  };
  return `${JSON.stringify(sorted(pact), null, 2)}\n`;
}

/**
 * Compares `interactions` with the committed {@link PACT_FILE}, and throws on any difference: a
 * pact that changes is regenerated in the same change. With `QITS_GOLDEN_UPDATE=true` it writes
 * the file instead.
 */
export function assertPactFile(interactions: readonly PactInteraction[]): void {
  const file = resolve(process.cwd(), PACT_FILE);
  const document = pactDocument(interactions);
  if (process.env[UPDATE_SWITCH] === 'true') {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, document);
    return;
  }
  const committed = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  if (committed === document) return;
  throw new Error(
    `${PACT_FILE} ${committed === undefined ? 'does not exist' : 'differs from what the specs generate'}. ` +
      `If the change is intended, regenerate it in this change: ${UPDATE_SWITCH}=true npm test`,
  );
}
