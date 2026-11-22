import { readFileSync, writeFileSync } from 'node:fs';

type Rules = Record<string, { combine: string; matchers: object[] }>;
type Entity = Record<string, unknown>;
interface WrittenPact {
  readonly interactions: readonly {
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly body?: { readonly content?: { entities?: Entity[] } };
      readonly matchingRules?: { body?: Rules };
    };
  }[];
}

/** An integer, or null while a provider older than qits-2496 still answers one. */
const INTEGER = (): Rules[string] => ({
  combine: 'OR',
  matchers: [{ match: 'integer' }, { match: 'null' }],
});

/**
 * Every `listProjectWork` answer's `priority` matches any integer (qits-2496). qits-projects
 * answers a number for every item now, 0 when nobody ranked it, so the pact must not pin the
 * recording's value: an example `null` (from an older recording) becomes 0, and the rule is
 * `integer` (or `null`, so the pact also holds against a provider not yet released with qits-2496),
 * on each `arrayContains` variant that carries it or on `$.entities[*].priority`.
 */
export function numericPriority(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as WrittenPact;
  for (const interaction of written.interactions) {
    if (interaction.comments?.references?.['qits-call']?.operationId !== 'listProjectWork') {
      continue;
    }
    const examples = interaction.response.body?.content?.entities;
    const rules = interaction.response.matchingRules?.body;
    if (!examples || !rules) continue;
    const carries = (e: Entity | undefined) => !!e && 'priority' in e;
    for (const example of examples) {
      if (carries(example) && example['priority'] === null) example['priority'] = 0;
    }
    const contains = rules['$.entities']?.matchers.find(
      (m) => (m as { match?: string }).match === 'arrayContains',
    ) as { variants?: { index: number; rules: Rules }[] } | undefined;
    if (contains?.variants) {
      for (const variant of contains.variants) {
        if (carries(examples[variant.index])) variant.rules['$.priority'] = INTEGER();
      }
    } else if (examples.some(carries)) {
      rules['$.entities[*].priority'] = INTEGER();
    }
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}
