import { inject } from '@angular/core';
import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands } from 'vitest/browser';
import type { WorkNode } from '$core/work/work-tree';

/**
 * Helpers for the screenshot tests of one work node (`work-board-node`, `work-list-node`): the
 * node is a real one, built by the app from qits-projects' golden masters.
 *
 * The spec routes `projects/:slug/:view/:qualifiedId` to a small host component. The host reads
 * the open project's work through `SelectedWork`, as the Work and Archive pages do, and draws the
 * one top-level node whose qualified id the URL names ({@link nodeOf}). {@link openRecordedWork}
 * navigates there and answers every request with a recording: the project list from "a project
 * exists", the work (and each campaign in it) from the case's state.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The top-level node of `tree` whose qualified id is `qualifiedId`. */
export function nodeOf(
  tree: readonly WorkNode[],
  qualifiedId: string | null,
): WorkNode | undefined {
  return tree.find((node) => node.entry.qualifiedId === qualifiedId);
}

/** The route's `:qualifiedId`, for a host component to pick its node with. */
export function routedQualifiedId(): string | null {
  return inject(ActivatedRoute).snapshot.paramMap.get('qualifiedId');
}

/**
 * Opens `/projects/<recorded slug>/<view>/<qualifiedId>` and answers the project list, then the
 * project's work from `state` and each campaign read from the same state. Returns the host's
 * element, its width fixed by the host.
 */
export async function openRecordedWork(
  http: HttpTestingController,
  view: string,
  qualifiedId: string,
  state: string,
): Promise<{ element: HTMLElement; harness: RouterTestingHarness }> {
  const list = await commands.goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const harness = await RouterTestingHarness.create();
  const navigated = harness.navigateByUrl(`/projects/${project.slug}/${view}/${qualifiedId}`);
  await settle();
  http.expectOne('/projects/api/projects').flush(list);
  await navigated;
  // SelectedWork's effect asks for the work once the project is known; let it run.
  TestBed.tick();
  await settle();
  TestBed.tick();
  await settle();
  http
    .expectOne(`/projects/api/projects/${project.id}/entities`)
    .flush(await commands.goldenMaster(state, 'listProjectEntities'));
  await settle();
  await settle();
  // The store then reads each campaign in the tree; a state records one campaign at most.
  const campaigns = http.match((request) => request.url.startsWith('/projects/api/campaigns/'));
  if (campaigns.length) {
    const campaign = await commands.goldenMaster(state, 'getCampaign');
    for (const request of campaigns) request.flush(campaign);
    await settle();
  }
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return { element: harness.routeNativeElement as HTMLElement, harness };
}
