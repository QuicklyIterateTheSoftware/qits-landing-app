import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page } from 'vitest/browser';
import { AppOrigins } from '$core/platform/app-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { ProjectEditorPage } from './project-editor.page';

/**
 * Screenshots of the Editor page, the frame around qits-workspaces' editor door, at the recorded
 * project's slug (qits-projects' "a project exists"). The open project and the navigation's
 * origins are stubbed: the page reads only the slug and the workspaces origin. The workspaces
 * origin is a test name that `stubOrigin` answers with a plain grey page, so the frame never loads
 * a remote page.
 */

const WORKSPACES = 'https://workspaces.qits.example';

describe('ProjectEditorPage (screenshots)', () => {
  /** The page with the workspaces origin `origin` (`''`: not known), and its frame. */
  async function render(origin: string) {
    const list = await commands.goldenMaster('a project exists', 'listProjects');
    const slug: string = list.entries[0].project.slug;
    TestBed.configureTestingModule({
      providers: [
        // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- fed through HTTP in the guard switch-over
        { provide: SelectedProject, useValue: { slug: signal(slug) } },
        // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- fed through HTTP in the guard switch-over
        { provide: AppOrigins, useValue: { origin: () => origin } },
      ],
    });
    const fixture = TestBed.createComponent(ProjectEditorPage);
    (fixture.nativeElement as HTMLElement).style.width = '760px';
    fixture.detectChanges();
    const frame = (fixture.nativeElement as HTMLElement).querySelector('iframe')!;
    return { slug, frame, view: page.elementLocator(fixture.nativeElement) };
  }

  it('frames the editor door once the workspaces origin is known', async () => {
    await commands.stubOrigin(WORKSPACES);
    const { slug, frame, view } = await render(WORKSPACES);
    // The frame's navigation to the stub runs after the binding set its address.
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    expect(frame.getAttribute('src')).toBe(`${WORKSPACES}/${slug}/editor`);
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('framed');
  });

  it('shows a blank frame while the workspaces origin is not known', async () => {
    const { frame, view } = await render('');
    expect(frame.getAttribute('src')).toBe('about:blank');
    await expect.element(view.getByTitle('Editor')).toBeVisible();
    await expect.element(view).toMatchScreenshot('blank');
  });
});
