import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { SegmentLog, type LogSegment } from './segment-log';

/** Screenshots of a log in segments: one settled, one running, one failed with a note. */
@Component({
  imports: [SegmentLog],
  host: { class: 'block w-[36rem] p-4' },
  template: `<ui-segment-log [segments]="segments" lede="The container is coming up." />`,
})
class Log {
  readonly segments: readonly LogSegment[] = [
    {
      name: 'queued',
      label: 'waiting for a slot on localhost',
      status: 'ok',
      badge: 'ok',
      lines: ['waiting for a slot on localhost'],
    },
    {
      name: 'container',
      label: 'container',
      status: 'running',
      badge: 'running',
      lines: ['pulling the workspace image', 'creating the container', 'starting the daemon'],
    },
    {
      name: 'clone',
      label: 'clone',
      status: 'failed',
      badge: 'failed',
      lines: ['fatal: could not read Username'],
      note: 'This step needs to sign in to qits-ci-service.',
    },
  ];
}

@Component({
  imports: [SegmentLog],
  host: { class: 'block w-[36rem] p-4' },
  template: `<ui-segment-log [segments]="[]" lede="The container is coming up." />`,
})
class Empty {}

describe('SegmentLog (screenshots)', () => {
  it('opens the running segment, folds the settled ones, and notes a failure', async () => {
    const fixture = TestBed.createComponent(Log);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('segments');
  });

  it('waits for the first line', async () => {
    const fixture = TestBed.createComponent(Empty);
    fixture.detectChanges();
    await expect.element(page.elementLocator(fixture.nativeElement)).toMatchScreenshot('waiting');
  });
});
