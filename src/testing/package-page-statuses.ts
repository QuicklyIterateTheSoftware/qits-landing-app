import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, type EnvironmentProviders, type Provider, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import type { ArtifactVersionStatus } from '$core/maintenance/maintenance.consumes';
import { artifactsGoldenMasters, maintenanceGoldenMaster } from './golden-masters';

/** The generated client builds its request after a few awaits; let them run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve));

/** qits-maintenance's recorded versions of one artifact: PENDING, INGESTED, FAILED, MISSING. */
export const SEVERAL_VERSIONS = 'an artifact released in several versions';

/** The path of qits-maintenance's versions read and of its re-read. */
export const STATUSES = '/maintenance/api/artifacts/versions';
export const INGEST = '/maintenance/api/artifacts/ingest';

/**
 * qits-maintenance's recorded versions put under the versions the package page's store recorded
 * (the two providers record unrelated artifacts): `under` names, per store version, the recorded
 * row (by its index, newest first) that answers for it, given the store's version; the recorded
 * rows no store version takes keep their own versions, which no row of the page shows.
 */
export function statusesUnder(under: Readonly<Record<string, number>>): ArtifactVersionStatus[] {
  const rows = maintenanceGoldenMaster<ArtifactVersionStatus[]>(
    SEVERAL_VERSIONS,
    'listArtifactVersions',
  );
  const versionAt = new Map(Object.entries(under).map(([version, i]) => [i, version]));
  return rows.map((row, i) => (versionAt.has(i) ? { ...row, version: versionAt.get(i) } : row));
}

/** The body qits-artifacts recorded for `operationId` in `state`. */
export const artifactsGoldenMaster = <T = unknown>(state: string, operationId: string): T =>
  artifactsGoldenMasters.body<T>(state, operationId);

/**
 * Configures a package page with the route `params`, in the browser; `clients` are the spec's
 * generated clients (qits-artifacts' and qits-maintenance's), which only a spec may name.
 */
export function configurePackagePage(
  params: Record<string, string>,
  clients: readonly (Provider | EnvironmentProviders)[],
): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      provideHttpClient(),
      provideHttpClientTesting(),
      ...clients,
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap(params)),
          snapshot: { paramMap: convertToParamMap(params) },
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** Runs the page's effects and lets the client build its requests. */
export async function ticked(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await settle();
  }
}

/** Creates `page` and runs it until its reads are on the wire. */
export async function created<T>(page: Type<T>) {
  const fixture = TestBed.createComponent(page);
  fixture.detectChanges();
  await ticked();
  return fixture;
}

/** An element's text, its whitespace collapsed. */
export const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
