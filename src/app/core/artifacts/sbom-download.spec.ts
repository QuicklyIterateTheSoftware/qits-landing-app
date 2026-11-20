import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { artifactsGoldenMasters } from '../../../testing/golden-masters';
import { fetchSbomFile, saveFile, SBOM_MEDIA_TYPE, sbomFileName } from './sbom-download';
import { literalSbomPaths } from './sbom-paths';

/** qits-artifacts' coordinate with an SBOM on its newer version, and that SBOM's document. */
const STATE = 'a maven coordinate with an sbom on one of two versions';
const { params } = artifactsGoldenMasters.operation(STATE, 'getSbom');
const COORDINATE = params['packageName'];
const VERSION = params['version'];
const DOCUMENT = artifactsGoldenMasters.text(STATE, 'getSbom');

/** qits-artifacts' scoped npm package with an SBOM on its newer version (qits-2326). */
const SCOPED = 'a scoped npm package with an sbom on one of two versions';
const NPM = artifactsGoldenMasters.operation(SCOPED, 'getSbom').params;
const NPM_DOCUMENT = artifactsGoldenMasters.text(SCOPED, 'getSbom');

// As `app.config.ts` does: the SBOM store's paths, with `:`, `@` and `/` literal.
if (!artifactsClient.interceptors.request.exists(literalSbomPaths)) {
  artifactsClient.interceptors.request.use(literalSbomPaths);
}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('sbom download (qits-2325, qits-2326)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(artifactsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * The one SBOM read in flight, checked for its address (the coordinate's `:` literal, as the
   * store's raw-path route needs it) and its text response type.
   */
  async function pending() {
    await settle();
    const request = http.expectOne(`/artifacts/sboms/maven/${COORDINATE}/-/${VERSION}`);
    expect(request.request.responseType).toBe('text');
    return request;
  }

  it('names the file by the package without its group or scope, and the version', () => {
    expect(sbomFileName('eu.wohlben.qits:contract-maven', '2100.2.0')).toBe(
      'contract-maven-2100.2.0.cdx.json',
    );
    expect(sbomFileName('@qits/angular', '1.0.0')).toBe('angular-1.0.0.cdx.json');
    expect(sbomFileName('plain', '1')).toBe('plain-1.cdx.json');
  });

  it('reads the document and makes it a CycloneDX file named <artifactId>-<version>', async () => {
    const reading = TestBed.runInInjectionContext(() =>
      fetchSbomFile('maven', COORDINATE, VERSION),
    );
    (await pending()).flush(DOCUMENT, {
      headers: { 'Content-Type': 'application/vnd.cyclonedx+json; version=1.6' },
    });
    const file = await reading;
    expect(file?.name).toBe('contract-maven-2100.2.0.cdx.json');
    expect(file?.blob.type).toBe(SBOM_MEDIA_TYPE);
    expect(await file?.blob.text()).toBe(DOCUMENT);
  });

  it('reads a scoped npm package’s document, its name literal on the wire (qits-2326)', async () => {
    const reading = TestBed.runInInjectionContext(() =>
      fetchSbomFile('npm', NPM['packageName'], NPM['version']),
    );
    await settle();
    // `@` and `/` as written: the store answers `%40contract%2Fcontract-scoped` with a 404.
    const request = http.expectOne('/artifacts/sboms/npm/@contract/contract-scoped/-/2100.2.0');
    expect(request.request.urlWithParams).not.toMatch(/%40|%2F/);
    expect(request.request.responseType).toBe('text');
    request.flush(NPM_DOCUMENT, {
      headers: { 'Content-Type': 'application/vnd.cyclonedx+json; version=1.6' },
    });
    const file = await reading;
    expect(file?.name).toBe('contract-scoped-2100.2.0.cdx.json');
    expect(file?.blob.type).toBe(SBOM_MEDIA_TYPE);
    expect(await file?.blob.text()).toBe(NPM_DOCUMENT);
  });

  it('makes no file when the read fails', async () => {
    const reading = TestBed.runInInjectionContext(() =>
      fetchSbomFile('maven', COORDINATE, VERSION),
    );
    (await pending()).flush(null, { status: 404, statusText: 'Not Found' });
    expect(await reading).toBeUndefined();
  });

  it('saves a file through a detached download link, and revokes its URL after', async () => {
    const blob = new Blob(['{}'], { type: SBOM_MEDIA_TYPE });
    const view = document.defaultView as Window & typeof globalThis;
    const create = vi.fn(() => 'blob:sbom');
    const revoke = vi.fn();
    Object.assign(view.URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('x-1.cdx.json');
      expect(this.href).toBe('blob:sbom');
    });
    try {
      saveFile({ name: 'x-1.cdx.json', blob }, document);
      expect(create).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revoke).not.toHaveBeenCalled();
      await settle();
      expect(revoke).toHaveBeenCalledWith('blob:sbom');
    } finally {
      click.mockRestore();
    }
  });
});
