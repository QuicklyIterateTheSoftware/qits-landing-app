import { inject } from '@angular/core';
import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { userEvent, type Locator } from 'vitest/browser';
import { goldenMaster } from './golden-master';
import type { WorkNode } from '$core/work/work-tree';
import { SelectedWork } from '$core/work/selected-work';
import { WorkspaceActivity } from '$core/workspaces/workspace-activity';

/**
 * Helpers for the screenshot tests of the work patterns (`kanban-board`, `epic-card`,
 * `ticket-card`, `work-list` and its items): the work is real, built by the app from
 * qits-projects' golden masters.
 *
 * The spec routes `projects/:slug/:view/:qualifiedId` to a small host component. The host reads
 * the open project's work through `SelectedWork`, as the work section's pages do, and draws the
 * one top-level node whose qualified id the URL names ({@link nodeOf}), or the whole tree. {@link openRecordedWork}
 * navigates there and answers every request with a recording: the project list from "a project
 * exists", the work from the case's state, and
 * the wrapper closings a VERIFIED ticket's line asks for ({@link answerWrapperClosings}). {@link openWorkspaces} then
 * reads the open workspaces, for the cards' Workspace links.
 *
 * The patterns' links are declared exits (epic qits-2000). {@link WORK_LINK_TARGETS} routes their
 * targets to nothing, before the host's route, so {@link follow} can click one and read where it
 * led and which outcome it recorded.
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
 * project's work from `state`. Returns the host's element, its width fixed by the host.
 */
export async function openRecordedWork(
  http: HttpTestingController,
  view: string,
  qualifiedId: string,
  state: string,
): Promise<{ element: HTMLElement; harness: RouterTestingHarness }> {
  const list = await goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const harness = await RouterTestingHarness.create();
  const navigated = harness.navigateByUrl(`/projects/${project.slug}/${view}/${qualifiedId}`);
  await settle();
  http.expectOne('/projects/api/projects').flush(list);
  await navigated;
  // SelectedWork reads the work once a page wants it and the project is known; let it run.
  TestBed.inject(SelectedWork).want();
  TestBed.tick();
  await settle();
  TestBed.tick();
  await settle();
  const work = await goldenMaster(state, 'listProjectWork');
  http.expectOne(`/projects/api/projects/${project.id}/work`).flush(work);
  await settle();
  await settle();
  // Not `whenStable()` yet: a VERIFIED ticket's line opens the wrapper closings' read, which keeps
  // the app unstable until it is answered.
  TestBed.tick();
  await settle();
  harness.fixture.detectChanges();
  await answerWrapperClosings(http, project.id);
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return { element: harness.routeNativeElement as HTMLElement, harness };
}

/**
 * The recorded wrapper closings: one VERIFIED ticket per verdict (qits-1873). The state also records
 * those tickets' work (`listProjectWork`) and the IN_FLIGHT one's `getWork`.
 */
export const WRAPPER_CLOSINGS = 'a project with VERIFIED tickets in every wrapper verdict';

/**
 * Answers the wrapper closings a VERIFIED ticket's line asks for (`app-wrapper-closing`,
 * qits-1873), when one asked, from {@link WRAPPER_CLOSINGS}. In any other state's work the
 * VERIFIED tickets are not the closings' (their numbers differ), so their lines keep "Closes once
 * its release lands". Whether one asked.
 */
export async function answerWrapperClosings(
  http: HttpTestingController,
  projectId: string,
): Promise<boolean> {
  TestBed.tick();
  await settle();
  const asked = http.match(`/projects/api/projects/${projectId}/wrapper-closings`);
  if (!asked.length) return false;
  const closings = await goldenMaster(WRAPPER_CLOSINGS, 'listWrapperClosings');
  for (const request of asked) request.flush(closings);
  await settle();
  return true;
}

/**
 * Reads the open workspaces (`WorkspaceActivity.wantOpen()`, as the work pages do) and answers them from
 * qits-workspaces' "a project with workspaces bound to work items", whose ids are those of
 * qits-projects' "… in detail" states: the epic, its PDF feature, a CSV task and the bug ticket of
 * that seed have an ACTIVE workspace.
 */
export async function openWorkspaces(
  http: HttpTestingController,
  harness: RouterTestingHarness,
): Promise<void> {
  TestBed.inject(WorkspaceActivity).wantOpen();
  TestBed.tick();
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
  await settle();
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
}

/**
 * Where the work patterns' links lead (epic qits-2000), routed to nothing: an item's page, its old
 * agent address and a release request's page. A spec lists them before its host's route, so a click
 * on a link navigates and renders nothing, reading no data.
 */
export const WORK_LINK_TARGETS: Routes = [
  { path: 'projects/:slug/work/detail/:id', children: [] },
  { path: 'projects/:slug/work/detail/:id/agent', children: [] },
  { path: 'projects/:slug/release-requests/:requestId', children: [] },
];

/**
 * Clicks `link` (a plain primary click, so its exit navigates through `go()`), lets the navigation
 * finish, and gives the URL it led to and the outcomes the test reached, as their marks name them.
 * With `keyboard`, it focuses the link and presses Enter instead: for a link that a stretched link
 * lies over (an epic lane's id, under its title's), which a pointer click would not reach.
 */
export async function follow(
  link: Locator,
  { keyboard = false } = {},
): Promise<{ url: string; reached: string[] }> {
  if (keyboard) {
    (link.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
  } else {
    await userEvent.click(link);
  }
  await settle();
  await settle();
  return {
    url: TestBed.inject(Router).url,
    reached: outcomeRecords().map((record) => `${record.interaction}:${record.outcome}`),
  };
}
