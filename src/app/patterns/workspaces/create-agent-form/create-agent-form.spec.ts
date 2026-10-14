import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import { SelectedWork } from '$core/work/selected-work';
import { goldenMaster, workspacesGoldenMaster } from '../../../../testing/golden-masters';
import { CreateAgentForm } from './create-agent-form';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const WRAPPER = 'repository-of-the-wrapper';
const SLUG = 'contract-00000001';
const HOSTING = 'a workspace slot hosting agents';
const TO_DISPATCH = 'a wrapper repository and a ticket to dispatch';
/** qits-projects' recorded work: tickets 10–13 (13 DONE), epics 2 and 9, and others. */
const WORK = goldenMaster('a bug ticket in detail', 'listProjectWork').entities as {
  id: string;
  qualifiedId: string;
  archetype: string;
  status: string;
  title: string;
}[];
const TICKET = WORK.find((e) => e.qualifiedId === 'contract-00000001-10')!;
const EPIC = WORK.find((e) => e.archetype === 'EPIC')!;

@Component({
  imports: [CreateAgentForm],
  template: `<app-create-agent-form
    [repositoryId]="wrapper"
    [slug]="slug"
    (created)="created = created + 1"
  />`,
})
class Host {
  readonly wrapper = WRAPPER;
  readonly slug = SLUG;
  created = 0;
}

describe('CreateAgentForm', () => {
  let http: HttpTestingController;
  let navigated: string[];

  beforeEach(() => {
    navigated = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        { provide: SelectedWork, useValue: { entries: signal(WORK) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async (url) => {
      navigated.push(String(url));
      return true;
    });
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const create = () =>
      Array.from(element.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create agent'),
      )!;
    const type = (selector: string, value: string, event = 'input') => {
      const field = element.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };
    const check = () => {
      const box = element.querySelector('input[type=checkbox]') as HTMLInputElement;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    return { fixture, element, create, type, check, text };
  }

  it('offers the project’s open tickets and epics, and nothing until one is typed', () => {
    const { element, create } = render();
    const offered = Array.from(element.querySelectorAll('datalist option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(offered).toContain('contract-00000001-10');
    expect(offered).toContain(EPIC.qualifiedId);
    expect(offered).not.toContain('contract-00000001-13');
    expect(offered).not.toContain('contract-00000001-3');
    expect(create().disabled).toBe(true);
  });

  it('creates an agent with the chosen harness, instruction and admin mode, then opens it', async () => {
    const { fixture, create, type, check, element } = render();
    type('input[list]', TICKET.qualifiedId);
    type('select', 'CLAUDE', 'change');
    type('textarea', '  Fix it.  ');
    check();
    create().click();
    await settle();
    const request = http.expectOne('/workspaces/api/agents');
    expect(request.request.body).toEqual({
      repositoryId: WRAPPER,
      workId: TICKET.id,
      entityId: TICKET.qualifiedId,
      kind: 'TICKET',
      admin: true,
      harness: 'CLAUDE',
      instruction: 'Fix it.',
    });
    request.flush(workspacesGoldenMaster(TO_DISPATCH, 'createAgent'));
    await settle();
    fixture.detectChanges();
    expect(navigated).toEqual([`/projects/${SLUG}/work/detail/${TICKET.qualifiedId}/agent`]);
    expect(fixture.componentInstance.created).toBe(1);
    expect((element.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
  });

  it('sends an epic as an epic, and leaves the harness to the service', async () => {
    const { fixture, create, type } = render();
    type('input[list]', EPIC.qualifiedId);
    create().click();
    await settle();
    const request = http.expectOne('/workspaces/api/agents');
    expect(request.request.body).toEqual({
      repositoryId: WRAPPER,
      workId: EPIC.id,
      entityId: EPIC.qualifiedId,
      kind: 'EPIC',
      admin: false,
    });
    request.flush(workspacesGoldenMaster(HOSTING, 'createAgent'));
    await settle();
    fixture.detectChanges();
    expect(navigated).toHaveLength(1);
  });

  it('refuses an item the project does not have, or that gets no agent, without a call', () => {
    const { fixture, create, type, text } = render();
    type('input[list]', 'contract-00000001-99');
    create().click();
    fixture.detectChanges();
    expect(text()).toContain('There is no work item contract-00000001-99 in this project.');
    type('input[list]', 'contract-00000001-3');
    create().click();
    fixture.detectChanges();
    expect(text()).toContain(
      'contract-00000001-3 is a feature. Only a ticket or an epic gets an agent.',
    );
  });

  it('shows the service’s refusal, and stays on the page', async () => {
    const { fixture, create, type, text } = render();
    type('input[list]', TICKET.qualifiedId);
    create().click();
    await settle();
    // No create refusal is recorded; an error answer is only a status and its message.
    http
      .expectOne('/workspaces/api/agents')
      .flush({ message: 'No such repository.' }, { status: 404, statusText: 'Not Found' });
    await settle();
    fixture.detectChanges();
    expect(text()).toContain('Could not create the agent — 404 No such repository.');
    expect(navigated).toEqual([]);
  });
});
