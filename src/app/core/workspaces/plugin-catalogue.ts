import type { InstalledPlugin } from './agent-plugins.consumes';

/** One plugin the plugins section offers by name. */
export interface PluginOffer {
  /** The bare id, which the install takes; the listing reports it marketplace-qualified. */
  readonly pluginId: string;
  readonly name: string;
  readonly summary: string;
}

/**
 * The curated set, ported from qits-workspaces-frontend. The list is the client's curation and the
 * marketplace is the authority: an id it gets wrong fails with the marketplace's own words.
 */
export const PLUGIN_CATALOGUE: readonly PluginOffer[] = [
  {
    pluginId: 'jdtls-lsp',
    name: 'Java language server',
    summary: 'Eclipse JDT over the agent’s edits: types, references and diagnostics for Java.',
  },
  {
    pluginId: 'typescript-lsp',
    name: 'TypeScript language server',
    summary: 'Types and references for TypeScript, which is every frontend here.',
  },
  {
    pluginId: 'pyright-lsp',
    name: 'Python language server',
    summary: 'Pyright, for a checkout with Python in it.',
  },
  {
    pluginId: 'rust-analyzer-lsp',
    name: 'Rust language server',
    summary: 'rust-analyzer, for a Cargo workspace.',
  },
];

/** `jdtls-lsp@claude-plugins-official` → `jdtls-lsp`: the id the install takes. */
export function barePluginId(pluginId: string): string {
  const at = pluginId.indexOf('@');
  return at < 0 ? pluginId : pluginId.slice(0, at);
}

/** One row of the plugins section. */
export interface PluginRow {
  readonly pluginId: string;
  readonly name: string;
  readonly summary: string;
  readonly installed: boolean;
  readonly enabled: boolean;
}

/**
 * The section's rows: the catalogue, each with what the shared agent home says of it, then every
 * installed plugin the catalogue does not name, so the list never claims less than the home holds.
 */
export function pluginRows(installed: readonly InstalledPlugin[]): readonly PluginRow[] {
  const byId = new Map(installed.map((entry) => [barePluginId(entry.pluginId), entry]));
  const known = PLUGIN_CATALOGUE.map((offer) => {
    const entry = byId.get(offer.pluginId);
    return { ...offer, installed: !!entry, enabled: entry?.enabled ?? false };
  });
  const extra = installed
    .filter((entry) => !PLUGIN_CATALOGUE.some((o) => o.pluginId === barePluginId(entry.pluginId)))
    .map((entry) => ({
      pluginId: barePluginId(entry.pluginId),
      name: entry.pluginId,
      summary: 'Installed on the shared agent home, and not one this page curates.',
      installed: true,
      enabled: entry.enabled,
    }));
  return [...known, ...extra];
}
