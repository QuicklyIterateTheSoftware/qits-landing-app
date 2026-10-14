import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import type { Runner, RunnerRegistration } from '$core/workspaces/runners.consumes';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { RunnerCard, type RunnerSlot } from './runner-card';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const IN_SERVICE = 'a runner in service';
const CONNECTED = 'a connected runner';
const UNREGISTERED = 'an unregistered runner';
const QUARANTINED = 'a quarantined runner';
const OWNS = 'a workspace slot hosting agents';
// Every recorded runner state uses the same runner id.
const ID = workspacesGoldenMasters.operation(IN_SERVICE, 'listRunners').params['runnerId'];
const RUNNER = `/workspaces/api/runners/${ID}`;
const NOW = new Date('2026-01-01T00:04:00Z');

const recorded = (state: string): Runner => workspacesGoldenMaster(state, 'listRunners')[0];

@Component({
  imports: [RunnerCard],
  template: `<app-runner-card
    [runner]="runner()"
    [slots]="slots()"
    slug="qits"
    [now]="now"
    (changed)="changed = changed + 1"
    (registration)="registration = $event"
  />`,
})
class Host {
  readonly runner = signal<Runner>(recorded(IN_SERVICE));
  readonly slots = signal<readonly RunnerSlot[]>([]);
  readonly now = NOW;
  changed = 0;
  registration: RunnerRegistration | null = null;
}

describe('RunnerCard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(runner: Runner = recorded(IN_SERVICE), slots: readonly RunnerSlot[] = []) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.runner.set(runner);
    fixture.componentInstance.slots.set(slots);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    const answered = async () => {
      await settle();
      fixture.detectChanges();
    };
    return { fixture, element, button, text, answered, host: fixture.componentInstance };
  }

  it('says what a runner in service is: connected, its slots, health and login', () => {
    const { text, element } = render(recorded(IN_SERVICE), [
      { id: 1, workspaceId: 'ws-contract', runtimeStatus: 'RUNNING' },
    ]);
    expect(text()).toContain('connected');
    expect(text()).toContain('since 4m ago');
    expect(text()).toContain('v2026.101.120000');
    expect(text()).not.toContain('updating');
    expect(text()).toContain('0/1 slots running');
    expect(text()).toContain('platform default memory');
    expect(text()).toContain('health check passed');
    expect(text()).toContain('selfTest');
    expect(text()).toContain('Claude logged in');
    expect(text()).toContain('Kimi not logged in');
    expect(text()).toContain(recorded(IN_SERVICE).loginCommand!);
    expect(text()).toContain(recorded(IN_SERVICE).kimiLoginCommand!);
    const slot = element.querySelector('section[aria-label="Slots"] a');
    expect(slot?.getAttribute('href')).toBe('/projects/qits/workspaces/1');
    expect(slot?.textContent).toContain('ws-contract');
  });

  it('says what a runner that has reported nothing yet lacks', () => {
    const { text } = render(recorded(CONNECTED));
    expect(text()).toContain('version —');
    // Connected at a version other than the pinned one: rolling over.
    expect(text()).toContain('updating');
    expect(text()).toContain('not reported yet');
    expect(text()).toContain('not checked yet');
    expect(text()).toContain('The login command appears once the runner has reported');
    expect(text()).toContain('None of this project’s workspaces run here.');
  });

  it('says a runner never connected', () => {
    const { text } = render(recorded(UNREGISTERED));
    expect(text()).toContain('never connected');
    expect(text()).toContain('last seen —');
  });

  it('shows a quarantine with its reason, and Greenlight lifts it', async () => {
    // "a quarantined runner" records no list: its greenlight answer, quarantined again with the
    // reason the service gives after a failed check, stands in for the row before the press.
    const runner = {
      ...workspacesGoldenMaster(QUARANTINED, 'greenlightRunner'),
      quarantined: true,
      quarantineReason: 'selfTest failed',
      quarantinedAt: '2026-01-01T00:00:00Z',
    } as Runner;
    const { text, button, answered, host } = render(runner);
    expect(text()).toContain('quarantined');
    expect(text()).toContain('Quarantined: selfTest failed, since 4m ago.');
    button('Actions')!.click();
    await answered();
    button('Greenlight')!.click();
    await settle();
    const request = http.expectOne(`${RUNNER}/greenlight`);
    expect(request.request.method).toBe('POST');
    request.flush(workspacesGoldenMaster(QUARANTINED, 'greenlightRunner'));
    await answered();
    expect(host.changed).toBe(1);
  });

  it('runs a health check, pressed until a newer check lands', async () => {
    const { button, answered, fixture } = render();
    button('Run health check')!.click();
    await settle();
    http
      .expectOne(`${RUNNER}/healthcheck`)
      .flush(workspacesGoldenMaster(IN_SERVICE, 'requestRunnerHealthcheck'), {
        status: 202,
        statusText: 'Accepted',
      });
    await answered();
    expect(button('Health check queued…')?.disabled).toBe(true);
    // A newer check: the recorded row, its health taken a minute later.
    const runner = recorded(IN_SERVICE);
    fixture.componentInstance.runner.set({
      ...runner,
      health: { ...runner.health, at: '2026-01-01T00:01:00Z' },
    });
    fixture.detectChanges();
    expect(button('Run health check')?.disabled).toBe(false);
  });

  it('says why a health check was refused, in the service’s words', async () => {
    const { button, answered, text } = render(recorded(UNREGISTERED));
    button('Run health check')!.click();
    await settle();
    const body = workspacesGoldenMaster(UNREGISTERED, 'requestRunnerHealthcheck');
    http.expectOne(`${RUNNER}/healthcheck`).flush(body, { status: 409, statusText: 'Conflict' });
    await answered();
    expect(text()).toContain(`Could not run a health check — 409 ${body.message}.`);
    expect(button('Run health check')?.disabled).toBe(false);
  });

  it('re-checks the login, and says why it was refused', async () => {
    const { button, answered, text } = render(recorded(UNREGISTERED));
    button('Re-check')!.click();
    await answered();
    expect(button('Re-checking…')).toBeDefined();
    const body = workspacesGoldenMaster(UNREGISTERED, 'requestRunnerLoginCheck');
    http.expectOne(`${RUNNER}/login-check`).flush(body, { status: 409, statusText: 'Conflict' });
    await answered();
    expect(text()).toContain(`Could not re-check — 409 ${body.message}.`);
  });

  it('opens the node details, every check with its data', async () => {
    const { button, answered, element } = render();
    button('Node details')!.click();
    await answered();
    http.expectOne(`${RUNNER}/health`).flush(workspacesGoldenMaster(IN_SERVICE, 'getRunnerHealth'));
    await answered();
    const details = element.querySelector('[aria-label="Node details"]')!;
    expect(details.textContent).toContain('docker');
    expect(details.textContent).toMatch(/version\s+27\.1/);
    button('Hide node details')!.click();
    await answered();
    expect(element.querySelector('[aria-label="Node details"]')).toBeNull();
  });

  it('says a runner never checked has no node details', async () => {
    const { button, answered, text } = render(recorded(UNREGISTERED));
    button('Node details')!.click();
    await answered();
    http.expectOne(`${RUNNER}/health`).flush(null, { status: 204, statusText: 'No Content' });
    await answered();
    expect(text()).toContain('No health check has reached the service yet.');
  });

  it('saves an edit, sending only the memory caps that moved', async () => {
    const { button, answered, element, host } = render();
    button('Actions')!.click();
    await answered();
    button('Edit')!.click();
    await answered();
    const inputs = element.querySelectorAll<HTMLInputElement>(
      '[aria-label="Runner actions"] input',
    );
    const change = workspacesGoldenMasters.operation(IN_SERVICE, 'patchRunner').body as Record<
      string,
      unknown
    >;
    inputs[0].value = String(change['slots']);
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = String(change['description']);
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].value = String(change['workspaceMemoryLimit']);
    inputs[2].dispatchEvent(new Event('input'));
    inputs[3].value = String(change['workspaceMemorySwapLimit']);
    inputs[3].dispatchEvent(new Event('input'));
    await answered();
    button('Save')!.click();
    await settle();
    const request = http.expectOne(RUNNER);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(change);
    request.flush(workspacesGoldenMaster(IN_SERVICE, 'patchRunner'));
    await answered();
    expect(button('Save')).toBeUndefined();
    expect(host.changed).toBe(1);
  });

  it('refuses a bad edit before sending it', async () => {
    const { button, answered, element, text } = render();
    button('Actions')!.click();
    await answered();
    button('Edit')!.click();
    await answered();
    const swap = element.querySelectorAll<HTMLInputElement>(
      '[aria-label="Runner actions"] input',
    )[3];
    swap.value = '8g';
    swap.dispatchEvent(new Event('input'));
    await answered();
    button('Save')!.click();
    await answered();
    expect(text()).toContain('Needs a workspace memory limit too');
  });

  it('rotates the token and hands the install line to the page', async () => {
    const { button, answered, host } = render(recorded(UNREGISTERED));
    button('Actions')!.click();
    await answered();
    button('Rotate token')!.click();
    await settle();
    const rotated = workspacesGoldenMaster(UNREGISTERED, 'rotateRunnerRegistrationToken');
    http.expectOne(`${RUNNER}/registration-token`).flush(rotated);
    await answered();
    expect(host.registration?.installLine).toBe(rotated.installLine);
    expect(button('Rotate token')).toBeUndefined();
  });

  it('deletes a runner after a confirmation', async () => {
    const { button, answered, host } = render(recorded(UNREGISTERED));
    button('Actions')!.click();
    await answered();
    button('Delete')!.click();
    await answered();
    expect(button('Keep it')).toBeDefined();
    button('Confirm delete?')!.click();
    await settle();
    http.expectOne(RUNNER).flush(null, { status: 204, statusText: 'No Content' });
    await answered();
    expect(host.changed).toBe(1);
  });

  it('names the workspaces a refused delete says the runner owns', async () => {
    const { button, answered, element, text } = render(recorded(IN_SERVICE), [
      { id: 1, workspaceId: 'ws-contract', runtimeStatus: 'RUNNING' },
    ]);
    button('Actions')!.click();
    await answered();
    button('Delete')!.click();
    await answered();
    button('Confirm delete?')!.click();
    await settle();
    http
      .expectOne(RUNNER)
      .flush(workspacesGoldenMaster(OWNS, 'deleteRunner'), { status: 409, statusText: 'Conflict' });
    await answered();
    expect(text()).toContain('This runner still owns 1 workspace.');
    const owner = element.querySelector('[role="alert"] a');
    expect(owner?.textContent).toBe('ws-contract');
    expect(owner?.getAttribute('href')).toBe('/projects/qits/workspaces/1');
  });

  it('says why a delete was refused otherwise', async () => {
    const { button, answered, text } = render(recorded(UNREGISTERED));
    button('Actions')!.click();
    await answered();
    button('Delete')!.click();
    await answered();
    button('Confirm delete?')!.click();
    await settle();
    http.expectOne(RUNNER).flush(null, { status: 403, statusText: 'Forbidden' });
    await answered();
    expect(text()).toContain('Could not delete this runner — 403.');
  });
});
