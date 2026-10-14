import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SegmentLog, type LogSegment } from './segment-log';

const QUEUED: LogSegment = {
  name: 'queued',
  label: 'waiting for a slot on localhost',
  status: 'ok',
  badge: 'ok',
  lines: ['waiting for a slot on localhost'],
};
const CONTAINER: LogSegment = {
  name: 'container',
  label: 'container',
  status: 'running',
  badge: 'running',
  lines: ['pulling the workspace image', 'starting'],
};

@Component({
  imports: [SegmentLog],
  template: `<ui-segment-log [segments]="segments()" lede="Coming up." [waiting]="waiting()" />`,
})
class Host {
  readonly segments = signal<readonly LogSegment[]>([QUEUED, CONTAINER]);
  readonly waiting = signal(true);
}

describe('SegmentLog', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const heads = () => Array.from(element.querySelectorAll('button'));
    const bodies = () => Array.from(element.querySelectorAll('pre')).map((p) => p.textContent);
    return { fixture, element, heads, bodies };
  }

  it('opens the running segment and folds a settled one to its head', () => {
    const { element, heads, bodies } = render();
    expect(element.textContent).toContain('Coming up.');
    expect(heads().map((h) => h.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
    expect(heads()[0].textContent).toContain('waiting for a slot on localhost');
    expect(bodies()).toEqual(['pulling the workspace image\nstarting']);
  });

  it('keeps a segment opened or closed by hand that way', () => {
    const { fixture, heads, bodies } = render();
    heads()[0].click();
    heads()[1].click();
    fixture.detectChanges();
    expect(bodies()).toEqual(['waiting for a slot on localhost']);
    fixture.componentInstance.segments.set([QUEUED, { ...CONTAINER, status: 'ok', badge: 'ok' }]);
    fixture.detectChanges();
    expect(heads().map((h) => h.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
  });

  it('waits for the first line while there is none, and shows a note', () => {
    const { fixture, element } = render();
    const waiting = () =>
      Array.from(element.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('Waiting for the first line'),
      );
    expect(waiting()?.classList).toContain('hidden');
    fixture.componentInstance.segments.set([]);
    fixture.detectChanges();
    expect(waiting()?.classList).not.toContain('hidden');
    fixture.componentInstance.segments.set([
      { ...CONTAINER, status: 'failed', badge: 'failed', note: 'Sign in to qits-ci-service.' },
    ]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Sign in to qits-ci-service.');
  });
});
