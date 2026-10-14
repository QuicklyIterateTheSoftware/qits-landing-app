import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../api/workspaces/client/client.gen';
import type { RunnerRegistration } from '$core/workspaces/runners.consumes';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../testing/golden-masters';
import { RegisterRunnerForm } from './register-runner-form';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const NO_RUNNERS = 'no runners';

@Component({
  imports: [RegisterRunnerForm],
  template: `<app-register-runner-form (registered)="registered = $event" />`,
})
class Host {
  registered: RunnerRegistration | null = null;
}

describe('RegisterRunnerForm', () => {
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

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const inputs = () => element.querySelectorAll<HTMLInputElement>('input');
    const type = (index: number, value: string) => {
      const input = inputs()[index];
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const register = () =>
      Array.from(element.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Register')!
        .click();
    const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
    const answered = async () => {
      await settle();
      fixture.detectChanges();
    };
    return { fixture, inputs, type, register, text, answered };
  }

  it('says what is wrong with the fields before sending anything', async () => {
    const { type, register, text, answered } = render();
    register();
    await answered();
    expect(text()).toContain('A name is required.');
    type(0, 'Build Box');
    type(2, '-1');
    type(3, '8 gigs');
    type(4, '4g');
    await answered();
    expect(text()).toContain('Lowercase letters, digits and hyphens, starting with a letter.');
    expect(text()).toContain('Slots must be 0 or more.');
    expect(text()).toContain('A docker size: digits and an optional unit');
  });

  it('registers a runner, leaving out what is blank, and hands the install line on', async () => {
    const { fixture, type, register, inputs, answered } = render();
    // The recording sends `{runnerName}`, which the provider fills in: the state's `localhost`.
    const recording = workspacesGoldenMasters.operation(NO_RUNNERS, 'createRunner');
    const sent = {
      ...(recording.body as { name: string; slots: number }),
      name: recording.params['runnerName'],
    };
    type(0, sent.name);
    await answered();
    register();
    await settle();
    const request = http.expectOne('/workspaces/api/runners');
    expect(request.request.body).toEqual(sent);
    const answer = workspacesGoldenMaster(NO_RUNNERS, 'createRunner');
    request.flush(answer, { status: 201, statusText: 'Created' });
    await answered();
    expect(fixture.componentInstance.registered?.installLine).toBe(answer.installLine);
    expect(inputs()[0].value).toBe('');
  });

  it('sends the description and memory caps when typed', async () => {
    const { type, register, answered } = render();
    type(0, 'build-box-1');
    type(1, 'Under the desk');
    type(2, '2');
    type(3, '8g');
    type(4, '-1');
    await answered();
    register();
    await settle();
    const request = http.expectOne('/workspaces/api/runners');
    expect(request.request.body).toEqual({
      name: 'build-box-1',
      description: 'Under the desk',
      slots: 2,
      workspaceMemoryLimit: '8g',
      workspaceMemorySwapLimit: '-1',
    });
    // No refusal of a create is recorded; an error answer is only a status here.
    request.flush(null, { status: 409, statusText: 'Conflict' });
    await answered();
  });

  it('says why the service refused', async () => {
    const { type, register, text, answered } = render();
    type(0, 'build-box-1');
    await answered();
    register();
    await settle();
    // No refusal of a create is recorded; an error answer is only a status here.
    http.expectOne('/workspaces/api/runners').flush(null, { status: 403, statusText: 'Forbidden' });
    await answered();
    expect(text()).toContain('Could not register this runner — 403.');
  });
});
