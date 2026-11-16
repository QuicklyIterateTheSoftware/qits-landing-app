import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { PAGE_RELOAD } from '$core/platform/local-network-permission';
import { PrivateApps } from '$core/platform/private-apps';
import { LOCAL_NETWORK_NOTICES, LocalNetworkNotice } from './local-network-notice';

/** A `PermissionStatus` whose state a test moves, firing `change` as the browser does. */
class FakeStatus {
  private readonly listeners = new Set<() => void>();
  constructor(public state: PermissionState) {}
  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }
  move(state: PermissionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The shell's local network notice (qits-2297), on a stubbed `navigator.permissions`. */
describe('LocalNetworkNotice', () => {
  const PRIVATE = ['https://projects.qits.example.test'];
  let origins: ReturnType<typeof signal<readonly string[]>>;
  let query: Mock<(descriptor: unknown) => Promise<unknown>>;
  let reload: Mock<() => void>;
  let http: HttpTestingController;

  function permission(answer: () => Promise<unknown>): void {
    query = vi.fn<(descriptor: unknown) => Promise<unknown>>(answer);
    vi.stubGlobal('navigator', { permissions: { query } });
  }

  async function render(platform = 'browser') {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: PrivateApps, useValue: { origins } },
        { provide: PAGE_RELOAD, useValue: reload },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LocalNetworkNotice);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, notice: () => element.querySelector('ui-toast') };
  }

  beforeEach(() => {
    origins = signal(PRIVATE);
    reload = vi.fn<() => void>();
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('prompt: says why the browser asks, and asks for local-network by its split name', async () => {
    permission(async () => new FakeStatus('prompt'));
    const { notice } = await render();
    expect(query).toHaveBeenCalledExactlyOnceWith({ name: 'local-network' });
    expect(notice()?.textContent).toContain(LOCAL_NETWORK_NOTICES.prompt.message);
    expect(notice()?.querySelector('button')?.textContent?.trim()).toBe('Allow access');
  });

  it('prompt: Allow access sends one call to a private app, so the prompt follows the press', async () => {
    permission(async () => new FakeStatus('prompt'));
    const { notice } = await render();
    notice()!.querySelector('button')!.click();
    await settle();
    http.expectOne('/projects/api/projects').flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
  });

  it('denied: says how to turn it back on, on a desktop and on Android', async () => {
    permission(async () => new FakeStatus('denied'));
    const { notice } = await render();
    const text = notice()?.textContent ?? '';
    expect(text).toContain('site settings icon left of the address');
    expect(text).toContain('Local network access');
    expect(text).toContain('Android');
    expect(notice()?.querySelector('button')?.className).toContain('hidden');
  });

  it('granted: shows nothing', async () => {
    permission(async () => new FakeStatus('granted'));
    const { notice } = await render();
    expect(notice()).toBeNull();
  });

  it('shows nothing where the query fails (a browser without the permission)', async () => {
    permission(async () => {
      throw new TypeError("The provided value 'local-network' is not a valid enum value");
    });
    const { notice } = await render();
    expect(query).toHaveBeenCalledOnce();
    expect(notice()).toBeNull();
  });

  it('shows nothing where there is no Permissions API', async () => {
    vi.stubGlobal('navigator', {});
    const { notice } = await render();
    expect(notice()).toBeNull();
  });

  it('asks nothing and shows nothing while no app is private, then asks once one is', async () => {
    origins.set([]);
    permission(async () => new FakeStatus('prompt'));
    const { fixture, notice } = await render();
    expect(query).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
    origins.set(PRIVATE);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(query).toHaveBeenCalledOnce();
    expect(notice()).not.toBeNull();
  });

  it('asks nothing on the server', async () => {
    permission(async () => new FakeStatus('prompt'));
    const { notice } = await render('server');
    expect(query).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it('follows the permission: denied shows the way back, granted hides it and reloads', async () => {
    const status = new FakeStatus('prompt');
    permission(async () => status);
    const { fixture, notice } = await render();
    status.move('denied');
    fixture.detectChanges();
    expect(notice()?.textContent).toContain(LOCAL_NETWORK_NOTICES.denied.message);
    expect(reload).not.toHaveBeenCalled();
    status.move('granted');
    fixture.detectChanges();
    expect(notice()).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });
});
