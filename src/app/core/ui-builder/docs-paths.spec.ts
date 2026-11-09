import { HttpRequest } from '@angular/common/http';
import { literalDocsPaths, literalDocsUrl } from './docs-paths';

/** What the generated client builds: every path parameter through `encodeURIComponent`. */
const generated = (site: string, version: string, path: string) =>
  `https://registry.example.test/artifacts/docs/docs/${encodeURIComponent(site)}/-/${version}/${encodeURIComponent(path)}`;

describe('literalDocsUrl', () => {
  it('puts the site and the file path on the wire with / and @ literal and [ ] encoded', () => {
    expect(
      literalDocsUrl(
        generated(
          '@routes/qits-landing',
          '2026.1109.73025',
          'src/app/routes/projects/[slug]/repositories/x.page.browser.spec.ts/loaded.html',
        ),
      ),
    ).toBe(
      'https://registry.example.test/artifacts/docs/docs/@routes/qits-landing/-/2026.1109.73025/' +
        'src/app/routes/projects/%5Bslug%5D/repositories/x.page.browser.spec.ts/loaded.html',
    );
  });

  it('keeps a literal % encoded, and the query as it is', () => {
    expect(literalDocsUrl(`${generated('@routes/a', '1', 'a%2Fb c.html')}?meta.x=%2F`)).toBe(
      'https://registry.example.test/artifacts/docs/docs/@routes/a/-/1/a%252Fb%20c.html?meta.x=%2F',
    );
  });

  it('leaves any other URL alone', () => {
    const url = 'https://registry.example.test/artifacts/npm/npm/%40qits%2Fangular';
    expect(literalDocsUrl(url)).toBe(url);
  });
});

describe('literalDocsPaths', () => {
  it('rewrites a docs request, and hands any other back unchanged', () => {
    const docs = new HttpRequest('GET', '/artifacts/docs/docs/%40routes%2Fa');
    expect(literalDocsPaths(docs).url).toBe('/artifacts/docs/docs/@routes/a');
    const other = new HttpRequest('GET', '/artifacts/sboms/npm/x/-/1');
    expect(literalDocsPaths(other)).toBe(other);
  });
});
