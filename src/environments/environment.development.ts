/**
 * `ng serve`: the app calls the platform's applications directly, under `platformDomain`, and
 * signs in with the idp's public client for loopback pages, `qits-landing-dev` (its only redirect is
 * `http://{localhost|127.0.0.1|[::1]}:<port>/auth/callback`). See `environment.ts`.
 */
export const environment = {
  platformDomain: 'qits.wohlben.eu' as string | null,
  signInClientId: 'qits-landing-dev',
};
