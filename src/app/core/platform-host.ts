/** The platform's domain, for a page served outside it (`ng serve` on localhost). */
const DEV_PLATFORM_DOMAIN = 'qits.wohlben.eu';

/** This application's own host label (`.config/qits/deployments.yml`: `host: landing`). */
const OWN_HOST_LABEL = 'landing';

/**
 * The origin of another platform application. Every application answers on `<app>.<domain>`, and
 * this one is served either on its own host (`landing.<domain>`) or at the platform's apex
 * (`<domain>/landing`), so the domain is this page's host without a leading `landing.`. Code plus
 * the domain this page already runs under, never configuration.
 *
 * On a host with no domain to keep (`localhost`, an IP address), the platform's own domain stands
 * in, so `ng serve` still points at the deployed applications.
 */
export function platformOrigin(
  app: string,
  location: Pick<Location, 'protocol' | 'hostname'>,
): string {
  const { hostname } = location;
  const local = !hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':');
  if (local) return `https://${app}.${DEV_PLATFORM_DOMAIN}`;
  const domain = hostname.startsWith(`${OWN_HOST_LABEL}.`)
    ? hostname.slice(OWN_HOST_LABEL.length + 1)
    : hostname;
  return `${location.protocol}//${app}.${domain}`;
}
