import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { client as edgeClient } from '../../../api/edge/client.gen';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { setPrivateOrigins } from '$core/platform/local-network';
import { PrivateApps } from '$core/platform/private-apps';
import { LocalNetworkNotice } from './local-network-notice';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Screenshots of the shell's local network notice (qits-2297) in the two states that show it. The
 * private apps come from the edge's recording (`a signed-in caller and a private app`, read by the
 * real `PrivateApps`); the permission is the browser's, not a backend's, so `navigator.permissions`
 * answers each state from a stand-in `PermissionStatus`.
 */
describe('LocalNetworkNotice (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(edgeClient),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    setPrivateOrigins([]);
  });

  /** The notice with the permission in `state`, once the edge has named the private app. */
  async function shown(state: PermissionState) {
    const status = { state, addEventListener: () => {}, removeEventListener: () => {} };
    vi.spyOn(navigator.permissions, 'query').mockResolvedValue(
      status as unknown as PermissionStatus,
    );
    const read = TestBed.inject(PrivateApps).read();
    await settle();
    http
      .expectOne('/main-navigation')
      .flush(
        await goldenMaster(
          'a signed-in caller and a private app',
          'getMainNavigation',
          'qits-edge',
        ),
      );
    await read;
    const fixture = TestBed.createComponent(LocalNetworkNotice);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    return page.getByTestId('local-network-notice');
  }

  it('prompt: why the browser asks, and Allow access', async () => {
    const notice = await shown('prompt');
    await expect.element(notice.getByRole('button', { name: 'Allow access' })).toBeVisible();
    await expect.element(notice).toMatchScreenshot('prompt', { kind: 'DATA' });
  });

  it('denied: how to turn local network access back on', async () => {
    const notice = await shown('denied');
    await expect.element(notice).toBeVisible();
    await expect.element(notice).toMatchScreenshot('denied', { kind: 'ERROR' });
  });
});
