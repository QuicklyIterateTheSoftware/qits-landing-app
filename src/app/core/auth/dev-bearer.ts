import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { DOCUMENT, inject, Injectable, type Provider } from '@angular/core';
import { catchError, from, Observable, switchMap, throwError } from 'rxjs';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { FetchEventSource } from '$core/events/fetch-event-source';
import { HOST_LABELS, PlatformOrigins, type PlatformApp } from '$core/platform/platform-origins';
import { DevTokens } from './dev-tokens';
import { Session, SignInCallback } from './session';

/**
 * `ng serve` ONLY: the bearer sign-in, wired in by `environment.development.ts`. Deployed, none of
 * this is in the bundle.
 *
 * - `Session` is {@link BearerSession}: signed in means holding a valid (or refreshable) token.
 * - `/auth/callback` finishes the sign-in through {@link DevTokens}.
 * - The event stream is read with `fetch()` and the bearer, since `EventSource` cannot send one.
 * - {@link devBearerInterceptor} puts the bearer on every call to a platform host.
 */
export function provideDevBearer(): Provider[] {
  return [
    DevTokens,
    { provide: SignInCallback, useExisting: DevTokens },
    { provide: Session, useClass: BearerSession },
    {
      provide: EVENT_SOURCE,
      useFactory: () => {
        const tokens = inject(DevTokens);
        return (url: string) => new FetchEventSource(url, () => tokens.accessToken());
      },
    },
  ];
}

/** Signed in when a token is at hand; otherwise starts the sign-in. */
@Injectable()
export class BearerSession extends Session {
  private readonly tokens = inject(DevTokens);

  async ensure(url: string): Promise<boolean> {
    if (await this.tokens.accessToken()) return true;
    void this.tokens.login(url);
    return false;
  }
}

/**
 * Puts `Authorization: Bearer` on every call to a platform host (`PlatformOrigins.api`), and on
 * nothing else. A 401 gets one refresh and one retry; when there is nothing to refresh with, the
 * visitor goes to sign in, back to this page.
 */
export const devBearerInterceptor: HttpInterceptorFn = (req, next) => {
  const origins = inject(PlatformOrigins);
  const platform = (Object.keys(HOST_LABELS) as PlatformApp[])
    .map((app) => origins.api(app))
    .filter((origin) => origin !== '');
  if (!platform.some((origin) => req.url.startsWith(`${origin}/`))) return next(req);
  const tokens = inject(DevTokens);
  const location = inject(DOCUMENT).location;

  let used: string | null = null;
  return from(tokens.accessToken()).pipe(
    switchMap((token) => {
      used = token;
      return send(req, token, next);
    }),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(tokens.retryToken(used)).pipe(
        switchMap((fresh) => {
          if (fresh) return send(req, fresh, next);
          void tokens.login(`${location.pathname}${location.search}`);
          return throwError(() => error);
        }),
      );
    }),
  );
};

function send(
  req: HttpRequest<unknown>,
  token: string | null,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  return next(token ? req.clone({ setHeaders: { authorization: `Bearer ${token}` } }) : req);
}
