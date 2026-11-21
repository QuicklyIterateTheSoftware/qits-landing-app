import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { openRoute, provideAppRoute } from '../../../../testing/browser/app-route';
import { standInIdpFrame, TEST_IDP } from '../../../../testing/browser/idp-admin-page';
import { shootShellMenus } from '../../../../testing/browser/shell-menus';

/**
 * Screenshots of the IdP admin section's Signed-in devices page (qits-2481) inside the shell (`openRoute`),
 * with no project open: the idp's `/idp/devices` in a frame (a fixed stand-in for its document,
 * `standInIdpFrame`), and Signed-in devices current below IdP admin. The page reads nothing and declares no
 * outcome of its own: the shell's are shot once (`shootShellMenus`).
 */
describe('IdpDevicesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  it('shows the idp’s devices page in a frame filling the main slot', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute('/idp/devices');
    const frame = opened.page.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(`${TEST_IDP}/idp/devices`);
    expect(frame?.getAttribute('title')).toBe('IdP admin: Signed-in devices');
    await standInIdpFrame(frame!, 'devices');
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'IdP admin', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Signed-in devices', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('devices', { kind: 'DATA' });
    await shootShellMenus(opened, 'devices');
  });
});
