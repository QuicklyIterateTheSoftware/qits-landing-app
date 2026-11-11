import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { AgentRow, type AgentRowData } from './agent-row';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WORKSPACES = 'a project with workspace slots hosting agents';
const NOW = new Date('2026-01-01T00:04:00Z');

/**
 * Screenshots of an agent's row (epic qits-1681), 40rem wide, one per agent of qits-workspaces'
 * "a project with workspace slots hosting agents" (`listAgents`): the bug ticket's agent holding
 * the slot and waiting on a release request, the epic's yielded in it, the improvement ticket's
 * queued. The slug is qits-projects' recorded project's ("a project exists"), which the state's
 * entity ids name. The clock is pinned four minutes after the recording's instants, so a wait
 * reads "4m ago".
 *
 * The agent's name is a declared exit (`open-agent-row` `open`, epic qits-2000), shown by `rows` and
 * followed once, to a stub of the agent's page.
 */
@Component({
  imports: [AgentRow],
  host: { class: 'flex w-[40rem] flex-col gap-2 p-4' },
  template: `
    @for (agent of agents(); track agent.agentId) {
      <app-agent-row [agent]="agent" [slug]="slug()" />
    }
  `,
})
class Rows {
  readonly agents = input.required<readonly AgentRowData[]>();
  readonly slug = input.required<string>();
}

describe('AgentRow (screenshots)', () => {
  let slug: string;

  beforeEach(async () => {
    slug = (await goldenMaster('a project exists', 'getProject')).project.slug;
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'projects/:slug/agents/:agentId', children: [] }])],
    });
  });

  afterEach(() => vi.useRealTimers());

  /** The recorded agents' rows. */
  async function shown() {
    const listed = await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces');
    const fixture = TestBed.createComponent(Rows);
    fixture.componentRef.setInput('agents', listed.agents);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    await fixture.whenStable();
    return { locator: page.elementLocator(fixture.nativeElement as HTMLElement), listed };
  }

  it('rows', async () => {
    const { locator } = await shown();
    await expect.element(locator.getByRole('link', { name: 'contract-00000001-9' })).toBeVisible();
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('rows', { kind: 'DATA' });
  });

  it('open-agent-row open: the agent’s name opens the agent’s page', async () => {
    const { locator, listed } = await shown();
    const agent = listed.agents.find(
      (a: AgentRowData) => a.entityId === 'contract-00000001-9',
    ) as AgentRowData;
    await userEvent.click(locator.getByRole('link', { name: 'contract-00000001-9' }));
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/${slug}/agents/${agent.agentId}`);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-agent-row:open',
    ]);
  });
});
