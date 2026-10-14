import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import type { ProcessSegment } from '$core/workspaces/process-log';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { segmentNote, StartingLog } from './starting-log';

@Component({
  imports: [StartingLog],
  template: `<app-starting-log [processId]="processId()" />`,
})
class Host {
  readonly processId = signal('p-1');
}

const segment = (hint: string | null, hintTarget: string | null): ProcessSegment => ({
  name: 'clone',
  lines: [],
  status: 'failed',
  hint,
  hintTarget,
});

describe('StartingLog', () => {
  it('follows the start’s stream and draws its segments', () => {
    let source: EventSourceLike | undefined;
    const opened: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: EVENT_SOURCE,
          useValue: (url: string) => {
            opened.push(url);
            source = { onmessage: null, onerror: null, readyState: 1, close: () => undefined };
            return source;
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(opened).toEqual([
      'https://workspaces.test/workspaces/api/technical-processes/p-1/events',
    ]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Waiting for the first line');
    source!.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          kind: 'line',
          segment: 'queued',
          seq: 0,
          line: 'waiting for a slot on localhost',
        }),
      }),
    );
    fixture.detectChanges();
    expect(element.querySelector('button')?.textContent).toContain(
      'waiting for a slot on localhost',
    );
    expect(element.textContent).toContain('waiting');
  });

  it('says what a failure is classified as', () => {
    expect(segmentNote(segment('remote-auth', 'qits-ci-service'))).toBe(
      'This step needs to sign in to qits-ci-service.',
    );
    expect(segmentNote(segment('disk-full', null))).toBe('The failure is classified as disk-full.');
    expect(segmentNote(segment('disk-full', 'runner-1'))).toBe(
      'The failure is classified as disk-full, for runner-1.',
    );
    expect(segmentNote(segment(null, null))).toBeUndefined();
  });
});
