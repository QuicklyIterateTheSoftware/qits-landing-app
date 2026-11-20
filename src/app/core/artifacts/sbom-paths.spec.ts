import { HttpRequest } from '@angular/common/http';
import { literalSbomPaths, literalSbomUrl } from './sbom-paths';

/** What the generated client builds: every path parameter through `encodeURIComponent`. */
const generated = (packageType: string, packageName: string, version?: string) =>
  `https://registry.example.test/artifacts/sboms/${packageType}/${encodeURIComponent(packageName)}` +
  (version === undefined ? '' : `/-/${encodeURIComponent(version)}`);

describe('literalSbomUrl (qits-2326)', () => {
  it('puts a scoped npm name on the wire with @ and / literal', () => {
    expect(literalSbomUrl(generated('npm', '@contract/contract-scoped'))).toBe(
      'https://registry.example.test/artifacts/sboms/npm/@contract/contract-scoped',
    );
    expect(literalSbomUrl(generated('npm', '@contract/contract-scoped', '2100.2.0'))).toBe(
      'https://registry.example.test/artifacts/sboms/npm/@contract/contract-scoped/-/2100.2.0',
    );
  });

  it('keeps a maven coordinate’s colon encoded, and a literal % encoded', () => {
    const maven = generated('maven', 'eu.wohlben.qits:contract-maven', '2100.2.0');
    expect(literalSbomUrl(maven)).toBe(maven);
    expect(literalSbomUrl(generated('npm', 'a%2Fb'))).toBe(
      'https://registry.example.test/artifacts/sboms/npm/a%252Fb',
    );
  });

  it('leaves any other URL alone', () => {
    const url =
      'https://registry.example.test/artifacts/api/repositories/npm/packages/%40qits%2Fangular/versions';
    expect(literalSbomUrl(url)).toBe(url);
  });
});

describe('literalSbomPaths', () => {
  it('rewrites an SBOM request, and hands any other back unchanged', () => {
    const sbom = new HttpRequest('GET', '/artifacts/sboms/npm/%40qits%2Fangular');
    expect(literalSbomPaths(sbom).url).toBe('/artifacts/sboms/npm/@qits/angular');
    const other = new HttpRequest('GET', '/artifacts/docs/docs/%40routes%2Fa');
    expect(literalSbomPaths(other)).toBe(other);
  });
});
