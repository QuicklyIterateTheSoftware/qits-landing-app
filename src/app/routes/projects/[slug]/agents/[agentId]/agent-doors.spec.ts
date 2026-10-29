import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The agent page's route directory: the layout and its tabs. */
const ROOT = resolve(process.cwd(), 'src/app/routes/projects/[slug]/agents/[agentId]');

/** What only a workspace-addressed door or the container proxy is spelled with. */
const FORBIDDEN = ['workspaces/container', 'WorkspaceContainer'];

/** Every source file under `dir`, specs left out: they fake the daemon's answers, not the page's calls. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * The agent page uses agent doors only (epic qits-1667): its terminal and chat are the agent
 * proxy's (`/workspaces/agent/<agent id>/…`), its verbs the agent's own, and the slot's container
 * verbs (`app-container-actions`, the `…WorkspaceContainer` calls) stay on the workspace page. A
 * source of the layout or a tab that spells the container proxy's path or a container call fails
 * here, an import of `patterns/workspaces/container-actions` among them.
 */
describe('the agent page’s doors', () => {
  it('has sources to check', () => {
    expect(sources(ROOT).map((path) => relative(ROOT, path))).toContain('agent.layout.ts');
  });

  it('names no container proxy path and no container door in any source', () => {
    const offending = sources(ROOT).flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return FORBIDDEN.filter((word) => text.includes(word)).map(
        (word) => `${relative(ROOT, path)}: ${word}`,
      );
    });
    expect(offending).toEqual([]);
  });
});
