import { workspaceDaemonGoldenMaster } from '../../../testing/golden-masters';
import { barePluginId, PLUGIN_CATALOGUE, pluginRows } from './plugin-catalogue';

describe('plugin catalogue', () => {
  it('strips the marketplace from an id, and keeps a bare one', () => {
    expect(barePluginId('jdtls-lsp@claude-plugins-official')).toBe('jdtls-lsp');
    expect(barePluginId('jdtls-lsp')).toBe('jdtls-lsp');
  });

  it('marks the recorded plugins installed, switched on or off, and the rest not installed', () => {
    const { installed } = workspaceDaemonGoldenMaster(
      'a workspace daemon with plugins installed',
      'listPlugins',
    );
    const rows = pluginRows(installed);
    expect(rows.map((r) => r.pluginId)).toEqual(PLUGIN_CATALOGUE.map((o) => o.pluginId));
    const by = new Map(rows.map((r) => [r.pluginId, r]));
    expect(by.get('jdtls-lsp')).toMatchObject({ installed: true, enabled: true });
    expect(by.get('typescript-lsp')).toMatchObject({ installed: true, enabled: false });
    expect(by.get('pyright-lsp')).toMatchObject({ installed: false, enabled: false });
  });

  it('lists an installed plugin it does not curate under the catalogue', () => {
    const rows = pluginRows([{ pluginId: 'other@claude-plugins-official', enabled: true }]);
    expect(rows.at(-1)).toMatchObject({
      pluginId: 'other',
      name: 'other@claude-plugins-official',
      installed: true,
    });
  });
});
