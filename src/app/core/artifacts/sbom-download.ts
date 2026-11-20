import { ARTIFACT_SBOM } from './artifacts.operations';

/**
 * Saving one release's SBOM as a file (qits-2325): the maven package page's Download, and the npm
 * package page's (qits-2326), so nothing here knows a package type. The store answers 401 without
 * the bearer, so a bare `<a href>` cannot fetch it: the document comes through the app's generated
 * client (`ARTIFACT_SBOM`, `getSbom`), which signs the call like every other, and is handed to the
 * browser as a Blob. The package name reaches the store with its `:`, `@` and `/` literal through
 * `literalSbomPaths` (`sbom-paths.ts`, qits-2325) on that client (a scoped npm name, qits-2326,
 * as `@qits/angular`); without it the store answers 404.
 */

/** The media type a saved SBOM carries: CycloneDX's JSON. */
export const SBOM_MEDIA_TYPE = 'application/vnd.cyclonedx+json';

/** One SBOM ready to save: its file name and its bytes. */
export interface SbomFile {
  readonly name: string;
  readonly blob: Blob;
}

/**
 * `<artifactId>-<version>.cdx.json`: the package's own name without its group or scope (the part
 * after the last `:` of a maven coordinate, after the last `/` of a scoped npm name).
 */
export function sbomFileName(packageName: string, version: string): string {
  const base = packageName.slice(
    Math.max(packageName.lastIndexOf(':'), packageName.lastIndexOf('/')) + 1,
  );
  return `${base}-${version}.cdx.json`;
}

/**
 * Asks the generated client for the body as text. The generated options do not name
 * `responseType`, but the client hands every option to the request's init, which reads it. Text,
 * not a Blob: the document is JSON, and the Blob is made here with its own media type.
 */
const AS_TEXT = { responseType: 'text' } as const;

/** The params of `packageType`'s `packageName` at `version`, its body read as text. */
export const sbomParams = (packageType: string, packageName: string, version: string) => ({
  path: { packageType, packageName, version },
  ...AS_TEXT,
});

/**
 * Reads the SBOM of `packageType`'s `packageName` at `version` and makes it a file; undefined when
 * the read fails (no document, a refusal, the network).
 */
export async function fetchSbomFile(
  packageType: string,
  packageName: string,
  version: string,
): Promise<SbomFile | undefined> {
  const { data, error } = await ARTIFACT_SBOM.fetch(sbomParams(packageType, packageName, version));
  if (error !== undefined || typeof data !== 'string') return undefined;
  return {
    name: sbomFileName(packageName, version),
    blob: new Blob([data], { type: SBOM_MEDIA_TYPE }),
  };
}

/**
 * Hands `file` to the browser as a download: an object URL on a detached `<a download>`, clicked,
 * and revoked once the click has handed it over (a task later: a URL revoked at once can cancel
 * the download). Only in a browser: the caller guards the server render.
 */
export function saveFile(file: SbomFile, document: Document): void {
  const view = document.defaultView;
  if (!view) return;
  const url = view.URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  view.setTimeout(() => view.URL.revokeObjectURL(url));
}
