import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { client as workspaceDaemonClient } from '../../../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../../../api/workspaces/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { AgentActionsStore } from '$core/workspaces/agent-actions.store';
import { AgentChatStore } from '$core/workspaces/agent-chat.store';
import { AgentFilesStore } from '$core/workspaces/agent-files.store';
import { AgentPromptStore } from '$core/workspaces/agent-prompt.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import { agentChatSocketUrl } from '$core/workspaces/chat-socket';
import { agentTerminalSocketUrl } from '$core/workspaces/terminal-socket';
import { workspacesGoldenMaster } from '../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';

const APP = resolve(process.cwd(), 'src/app');

/** The agent page's route directory: the layout and its tabs. */
const ROOT = join(APP, 'routes/projects/[slug]/agents/[agentId]');

/**
 * What only the container proxy or a workspace-addressed container door is spelled with: the
 * proxy's path, a `…WorkspaceContainer` call, and the module that builds container addresses.
 */
const FORBIDDEN = [
  'workspaces/container',
  'WorkspaceContainer',
  'container-proxy',
  'containerBase',
];

/** The `tsconfig.json` path aliases. */
const ALIASES: Readonly<Record<string, string>> = {
  $core: join(APP, 'core'),
  $ui: join(APP, 'ui'),
  $patterns: join(APP, 'patterns'),
  $layout: join(APP, 'layout'),
};

/** Every source file under `dir`, specs left out: they fake the answers, not the page's calls. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The app source an import names, or null for a package or a generated client (`src/app/api/`). */
function resolveImport(from: string, specifier: string): string | null {
  const [head, ...rest] = specifier.split('/');
  const base = ALIASES[head]
    ? join(ALIASES[head], ...rest)
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : null;
  const inApi = !!base && !relative(join(APP, 'api'), base).startsWith('..');
  if (!base || inApi) return null;
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The agent page's sources and every app source they import, transitively (no specs, no api). */
function closure(): string[] {
  const seen = new Set<string>();
  const queue = sources(ROOT);
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      const target = resolveImport(file, match[1]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen];
}

/**
 * The agent page uses agent doors only (epic qits-1667): its reads and writes are the agent's
 * (`/workspaces/api/agents/{id}/…`), its daemon reads and sockets the agent proxy's
 * (`/workspaces/agent/<agent id>/…`), and everything addressed to the slot's container — the
 * container proxy, the container verbs, the harness install — is the workspace page's.
 */
describe('the agent page’s doors', () => {
  it('names no container proxy path or container door in its sources or anything they import', () => {
    const files = closure();
    expect(files.map((path) => relative(ROOT, path))).toContain('agent.layout.ts');
    expect(files.map((path) => relative(APP, path))).toContain('core/workspaces/agents.store.ts');
    const offending = files.flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return FORBIDDEN.filter((word) => text.includes(word)).map(
        (word) => `${relative(APP, path)}: ${word}`,
      );
    });
    expect(offending).toEqual([]);
  });

  describe('the stores it calls, at run time', () => {
    const ORIGIN = 'https://workspaces.qits.example';
    const AGENT = workspacesGoldenMaster('an agent with a saved prompt draft', 'getAgent');
    const agentId: string = AGENT.agentId;
    const settle = () => new Promise((resolve) => setTimeout(resolve));
    let http: HttpTestingController;
    let urls: string[];

    beforeEach(() => {
      urls = [];
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideHeyApiClient(workspacesClient),
          provideHeyApiClient(workspaceDaemonClient),
          provideTestPlatformOrigins({ workspaces: ORIGIN }),
        ],
      });
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    /** Records every request on hand; answers it with `answer`, else as refused. */
    async function answerAll(answer?: (request: TestRequest) => boolean) {
      await settle();
      for (const request of http.match(() => true)) {
        urls.push(request.request.urlWithParams);
        if (!answer?.(request)) request.flush(null, { status: 503, statusText: 'No' });
      }
      await settle();
    }

    it('asks only the agent’s doors for everything the page reads and writes', async () => {
      const agents = TestBed.inject(AgentsStore);
      const loading = agents.loadAgent(agentId);
      await answerAll((request) => {
        if (!request.request.url.endsWith(`/agents/${agentId}`)) return false;
        request.flush(AGENT);
        return true;
      });
      await answerAll();
      await loading;

      const chats = TestBed.inject(AgentChatStore);
      const files = TestBed.inject(AgentFilesStore);
      const prompts = TestBed.inject(AgentPromptStore);
      const actions = TestBed.inject(AgentActionsStore);
      const calls: Promise<unknown>[] = [
        chats.loadTranscript(agentId),
        chats.refine(agentId, 'notes', null),
        files.list(agentId),
        files.list(agentId, 'node_modules'),
        files.read(agentId, 'README.md'),
        files.detect(agentId),
        prompts.readDraft(agentId),
        prompts.saveDraft(agentId, 'text'),
        prompts.discardDraft(agentId),
        prompts.prompt(agentId, 'text'),
        actions.interruptAgent(agentId),
        actions.stopAgent(agentId),
        actions.restartAgent(agentId),
        actions.discardAgent(agentId),
      ];
      await answerAll();
      await Promise.all(calls);

      expect(urls.length).toBeGreaterThan(calls.length);
      expect(urls.filter((url) => url.includes('/workspaces/container/'))).toEqual([]);
      for (const url of urls) {
        expect(url).toMatch(new RegExp(`/workspaces/(api/agents/${agentId}|agent/${agentId}/)`));
      }
    });

    it('opens its sockets on the agent proxy', () => {
      expect(agentTerminalSocketUrl(ORIGIN, agentId)).toBe(
        `wss://workspaces.qits.example/workspaces/agent/${agentId}/terminal`,
      );
      expect(agentChatSocketUrl(ORIGIN, agentId)).toBe(
        `wss://workspaces.qits.example/workspaces/agent/${agentId}/chat`,
      );
    });
  });
});
