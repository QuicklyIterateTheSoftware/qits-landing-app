import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  FetchEventSource,
  QITS_SIGN_IN,
  QitsAuthCallbackPage,
  qitsAuthCallbackRoute,
} from '@qits/angular';
import { firstValueFrom } from 'rxjs';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { appConfig } from './app.config';

/** Under `ng test` the environment is the development one (`environment.development.ts`). */
const TOKENS_KEY = 'qits.sign-in.qits-landing-dev.tokens';

/** The bearer sign-in as `app.config.ts` wires it (epic qits-543). */
describe('appConfig', () => {
  beforeEach(() => {
    sessionStorage.setItem(
      TOKENS_KEY,
      JSON.stringify({ accessToken: 'T', accessExpiresAt: Date.now() + 3_600_000 }),
    );
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
  });

  afterEach(() => sessionStorage.removeItem(TOKENS_KEY));

  it("provides the bearer sign-in with the environment's client and platform domain", () => {
    expect(TestBed.inject(QITS_SIGN_IN)).toEqual({
      clientId: 'qits-landing-dev',
      platformDomain: 'qits.wohlben.eu',
      idpOrigin: 'https://idp.qits.wohlben.eu',
    });
  });

  it('puts the bearer on a platform call, and on nothing else', async () => {
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    const platform = firstValueFrom(client.get('https://projects.qits.wohlben.eu/projects/api/x'));
    const elsewhere = firstValueFrom(client.get('https://example.org/x'));
    await new Promise((resolve) => setTimeout(resolve));
    const signed = http.expectOne('https://projects.qits.wohlben.eu/projects/api/x');
    expect(signed.request.headers.get('authorization')).toBe('Bearer T');
    expect(signed.request.withCredentials).toBe(false);
    signed.flush({});
    const plain = http.expectOne('https://example.org/x');
    expect(plain.request.headers.has('authorization')).toBe(false);
    plain.flush({});
    await Promise.all([platform, elsewhere]);
    http.verify();
  });

  it('reads the event stream through fetch() with the bearer', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const source = TestBed.inject(EVENT_SOURCE)('https://events.qits.wohlben.eu/events/api/stream');
    expect(source).toBeInstanceOf(FetchEventSource);
    source.close();
    vi.unstubAllGlobals();
  });

  it('has exactly one auth/callback route, the library one, first', () => {
    const config = TestBed.inject(Router).config;
    expect(config[0]).toEqual(qitsAuthCallbackRoute);
    expect(config[0].component).toBe(QitsAuthCallbackPage);
    expect(config.filter((route) => route.path === 'auth/callback')).toHaveLength(1);
  });
});
