/** The platform's domain, for a page served outside it (`ng serve` on localhost). */
const DEV_PLATFORM_DOMAIN = 'qits.wohlben.eu';

/**
 * The origin of another platform application, derived from this page's host: every application
 * answers on `<app>.<domain>`, so the first label of this host is swapped for `app`. Code plus the
 * domain this page already runs under, never configuration.
 *
 * On a host with no domain to keep (`localhost`, an IP), the platform's own domain stands in, so
 * `ng serve` still points at the deployed applications.
 */
export function platformOrigin(
  app: string,
  location: Pick<Location, 'protocol' | 'hostname'>,
): string {
  const labels = location.hostname.split('.');
  const isName = labels.length >= 3 && !/^\d+$/.test(labels[labels.length - 1]);
  const domain = isName ? labels.slice(1).join('.') : DEV_PLATFORM_DOMAIN;
  const protocol = isName ? location.protocol : 'https:';
  return `${protocol}//${app}.${domain}`;
}
