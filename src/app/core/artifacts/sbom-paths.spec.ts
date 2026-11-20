import { HttpRequest } from '@angular/common/http';
import { literalSbomPaths, literalSbomUrl } from './sbom-paths';

const ORIGIN = 'https://artifacts.example.test';

/** What the generated client builds: every path parameter through `encodeURIComponent`. */
const list = (type: string, name: string) =>
  `${ORIGIN}/artifacts/sboms/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;
const document = (type: string, name: string, version: string) =>
  `${list(type, name)}/-/${encodeURIComponent(version)}`;

describe('literalSbomUrl', () => {
  it('puts a maven coordinate on the wire with its : literal, for the list and a document', () => {
    expect(literalSbomUrl(list('maven', 'eu.wohlben.qits:qits-eventstream'))).toBe(
      `${ORIGIN}/artifacts/sboms/maven/eu.wohlben.qits:qits-eventstream`,
    );
    expect(literalSbomUrl(document('maven', 'eu.wohlben.qits:qits-eventstream', '2026.1.0'))).toBe(
      `${ORIGIN}/artifacts/sboms/maven/eu.wohlben.qits:qits-eventstream/-/2026.1.0`,
    );
  });

  it('puts a scoped npm name on the wire with its @ and / literal', () => {
    expect(literalSbomUrl(list('npm', '@qits/angular'))).toBe(
      `${ORIGIN}/artifacts/sboms/npm/@qits/angular`,
    );
    expect(literalSbomUrl(document('npm', '@qits/angular', '1.0.0'))).toBe(
      `${ORIGIN}/artifacts/sboms/npm/@qits/angular/-/1.0.0`,
    );
  });

  it('works on a relative URL too', () => {
    expect(literalSbomUrl('/artifacts/sboms/maven/a%3Ab')).toBe('/artifacts/sboms/maven/a:b');
  });

  it('keeps a literal % encoded, and the query as it is', () => {
    expect(literalSbomUrl(`${list('maven', 'a%3Ab:c')}?x=%3A%40%2F`)).toBe(
      `${ORIGIN}/artifacts/sboms/maven/a%253Ab:c?x=%3A%40%2F`,
    );
  });

  it('leaves any other URL alone', () => {
    const npm = `${ORIGIN}/artifacts/npm/npm/%40qits%2Fangular`;
    expect(literalSbomUrl(npm)).toBe(npm);
    // The maven versions door is JAX-RS and takes the coordinate encoded.
    const versions = `${ORIGIN}/artifacts/api/repositories/maven/maven-packages/eu.wohlben.qits%3Aqits-eventstream/versions`;
    expect(literalSbomUrl(versions)).toBe(versions);
  });
});

describe('literalSbomPaths', () => {
  it('rewrites an SBOM request, and hands any other back unchanged', () => {
    const sbom = new HttpRequest(
      'GET',
      '/artifacts/sboms/maven/eu.wohlben.qits%3Aqits-eventstream',
    );
    expect(literalSbomPaths(sbom).url).toBe(
      '/artifacts/sboms/maven/eu.wohlben.qits:qits-eventstream',
    );
    const literal = new HttpRequest('GET', '/artifacts/sboms/maven/a:b');
    expect(literalSbomPaths(literal)).toBe(literal);
    const other = new HttpRequest('GET', '/artifacts/docs/docs/%40routes%2Fa');
    expect(literalSbomPaths(other)).toBe(other);
  });
});
