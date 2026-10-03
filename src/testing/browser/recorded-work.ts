import { inject } from '@angular/core';
import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { goldenMaster } from './golden-master';
import type { WorkNode } from '$core/work/work-tree';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';

/**
 * Helpers for the screenshot tests of the work patterns (`kanban-board`, `epic-card`,
 * `ticket-card`, `work-list` and its items): the work is real, built by the app from
 * qits-projects' golden masters.
 *
 * The spec routes `projects/:slug/:view/:qualifiedId` to a small host component. The host reads
 * the open project's work through `SelectedWork`, as the work section's pages do, and draws the
 * one top-level node whose qualified id the URL names ({@link nodeOf}), or the whole tree. {@link openRecordedWork}
 * navigates there and answers every request with a recording: the project list from "a project
 * exists", the work (and each campaign in it) from the case's state. {@link openWorkspaces} then
 * loads the open workspaces, for the cards' Workspace links.
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
 * project's work from `state`. Each campaign read gets the `getCampaign` recording of the one state
 * in `campaignStates` (by default `state` alone) whose campaign has the id asked for: a state
 * records one answer per operation, so a second campaign is recorded as a state of its own over
 * the same seed, with the same frozen ids. Returns the host's element, its width fixed by the host.
 */
export async function openRecordedWork(
  http: HttpTestingController,
  view: string,
  qualifiedId: string,
  state: string,
  campaignStates: readonly string[] = [state],
): Promise<{ element: HTMLElement; harness: RouterTestingHarness }> {
  const list = await goldenMaster('a project exists', 'listProjects');
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
    .flush(await goldenMaster(state, 'listProjectEntities'));
  await settle();
  await settle();
  // The store then reads each campaign in the tree.
  const campaigns = http.match((request) => request.url.startsWith('/projects/api/campaigns/'));
  if (campaigns.length) {
    const recorded = await Promise.all(campaignStates.map((s) => goldenMaster(s, 'getCampaign')));
    for (const request of campaigns) {
      const id = request.request.url.split('/').pop();
      const answer = recorded.find((body) => body.campaign.id === id);
      if (!answer)
        throw new Error(`no state in [${campaignStates.join(', ')}] records campaign ${id}`);
      request.flush(answer);
    }
    await settle();
  }
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return { element: harness.routeNativeElement as HTMLElement, harness };
}

/**
 * Loads the open workspaces (`WorkspacesStore.load()`, as the work pages do) and answers them from
 * qits-workspaces' "a project with workspaces bound to work items", whose ids are those of
 * qits-projects' "… in detail" states: the epic, its PDF feature, a CSV task and the bug ticket of
 * that seed have an ACTIVE workspace.
 */
export async function openWorkspaces(
  http: HttpTestingController,
  harness: RouterTestingHarness,
): Promise<void> {
  const load = TestBed.inject(WorkspacesStore).load();
  await settle();
  http
    .expectOne('/workspaces/api/work/workspaces')
    .flush(
      await goldenMaster(
        'a project with workspaces bound to work items',
        'listOpenWorkspaces',
        'qits-workspaces',
      ),
    );
  await load;
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
}
