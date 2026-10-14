import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import type { SlotDetail } from '$core/workspaces/agents.consumes';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { ContainerActions } from './container-actions';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const STOPPED = 'a stopped workspace slot on a runner in service';
const RUNNING = 'a workspace slot running on a runner in service';
const OFFLINE = 'a workspace slot on a disconnected runner';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const ID = Number(
  workspacesGoldenMasters.operation(STOPPED, 'ensureWorkspaceContainer').params['workspaceId'],
);
const SLOT = `/workspaces/api/workspaces/${ID}`;

@Component({
  imports: [ContainerActions],
  template: `<app-container-actions [slot]="slot()" (changed)="changed = changed + 1" />`,
})
class Host {
  readonly slot = signal<Pick<SlotDetail, 'id' | 'runtimeStatus'>>({
    id: ID,
    runtimeStatus: 'STOPPED',
  });
  changed = 0;
}

describe('ContainerActions', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(runtimeStatus: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.slot.set({
      id: ID,
      runtimeStatus: runtimeStatus as SlotDetail['runtimeStatus'],
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    return { fixture, button, text };
  }

  async function answered(fixture: { detectChanges(): void }) {
    await settle();
    fixture.detectChanges();
  }

  it('starts a stopped container, and has the page read the slot again', async () => {
    const { fixture, button, text } = render('STOPPED');
    expect(button('Stop')).toBeUndefined();
    button('Start').click();
    fixture.detectChanges();
    expect(text()).toContain('Starting…');
    await settle();
    http
      .expectOne(`${SLOT}/ensure-container`)
      .flush(workspacesGoldenMaster(STOPPED, 'ensureWorkspaceContainer'));
    await answered(fixture);
    expect(fixture.componentInstance.changed).toBe(1);
    expect(text()).not.toContain('That did not work');
  });

  it('stops a running container', async () => {
    const { fixture, button } = render('RUNNING');
    button('Stop').click();
    await settle();
    http
      .expectOne(`${SLOT}/stop-container`)
      .flush(workspacesGoldenMaster(RUNNING, 'stopWorkspaceContainer'));
    await answered(fixture);
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('shows a refused start in the service’s words, and still reads the slot again', async () => {
    const { fixture, button, text } = render('UNAVAILABLE');
    expect(text()).toContain('runner is offline');
    button('Start').click();
    await settle();
    const body = workspacesGoldenMaster(OFFLINE, 'ensureWorkspaceContainer');
    http.expectOne(`${SLOT}/ensure-container`).flush(body, { status: 409, statusText: 'Conflict' });
    await answered(fixture);
    expect(text()).toContain(`That did not work — 409 ${body.message}.`);
    expect(fixture.componentInstance.changed).toBe(1);
  });

  it('asks before a recreate, and shows its refusal', async () => {
    const { fixture, button, text } = render('RUNNING');
    button('Recreate').click();
    fixture.detectChanges();
    button('Cancel').click();
    fixture.detectChanges();
    expect(button('Recreate')).toBeDefined();
    button('Recreate').click();
    fixture.detectChanges();
    button('Confirm recreate?').click();
    await settle();
    const body = workspacesGoldenMaster(UNREACHABLE, 'recreateWorkspaceContainer');
    http
      .expectOne(`${SLOT}/recreate-container`)
      .flush(body, { status: 400, statusText: 'Bad Request' });
    await answered(fixture);
    expect(text()).toContain(`That did not work — 400 ${body.message}`);
  });
});
