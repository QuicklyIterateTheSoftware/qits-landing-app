import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import {
  applyFrame,
  EMPTY_LOG,
  ProcessLog,
  segmentLabel,
  segmentStatusLabel,
  type ProcessFrame,
  type ProcessLogState,
} from './process-log';

/** A container start, as qits-workspaces streams one (its `TechnicalProcessFrame`s). */
const START: readonly ProcessFrame[] = [
  { kind: 'segment-open', segment: 'queued', seq: 0 },
  { kind: 'line', segment: 'queued', seq: 1, line: 'waiting for a slot on localhost' },
  { kind: 'segment-settled', segment: 'queued', seq: 2, status: 'ok' },
  { kind: 'segment-open', segment: 'container', seq: 3 },
  { kind: 'line', segment: 'container', seq: 4, line: 'pulling the workspace image' },
  { kind: 'ping', seq: 5 },
];

const fold = (frames: readonly ProcessFrame[], from: ProcessLogState = EMPTY_LOG) =>
  frames.reduce(applyFrame, from);

describe('applyFrame', () => {
  it('builds segments in the order the process opened them', () => {
    const log = fold(START);
    expect(log.outcome).toBe('running');
    expect(log.segments.map((s) => [s.name, s.status, s.lines])).toEqual([
      ['queued', 'ok', ['waiting for a slot on localhost']],
      ['container', 'running', ['pulling the workspace image']],
    ]);
  });

  it('opens a segment a line names before its open frame', () => {
    const log = fold([{ kind: 'line', segment: 'clone', seq: 0, line: 'cloning' }]);
    expect(log.segments[0]).toMatchObject({ name: 'clone', lines: ['cloning'] });
  });

  it('keeps a failure’s classification, and ends on the terminal frame', () => {
    const log = fold([
      ...START,
      {
        kind: 'segment-settled',
        segment: 'container',
        seq: 6,
        status: 'failed',
        hint: 'remote-auth',
        hintTarget: 'qits-ci-service',
      },
      { kind: 'done', seq: 7, status: 'failed' },
    ]);
    expect(log.segments[1]).toMatchObject({
      status: 'failed',
      hint: 'remote-auth',
      hintTarget: 'qits-ci-service',
    });
    expect(log.outcome).toBe('failed');
    expect(fold([{ kind: 'done', seq: 0, status: 'ok' }]).outcome).toBe('ok');
  });

  it('starts over when a reconnect replays the stream with fresh ordinals', () => {
    const replayed = fold(START.slice(0, 2), fold(START));
    expect(replayed.segments.map((s) => s.name)).toEqual(['queued']);
    expect(replayed.segments[0].lines).toEqual(['waiting for a slot on localhost']);
  });

  it('reads a queued wait in the service’s own words', () => {
    const [queued, container] = fold(START).segments;
    expect(segmentLabel(queued)).toBe('waiting for a slot on localhost');
    expect(segmentLabel({ ...queued, lines: [] })).toBe('waiting for a runner');
    expect(segmentLabel(container)).toBe('container');
    expect(segmentStatusLabel({ ...queued, status: 'running' })).toBe('waiting');
    expect(segmentStatusLabel(container)).toBe('running');
    expect(segmentStatusLabel(queued)).toBe('ok');
  });
});

describe('ProcessLog', () => {
  let opened: string[];
  let source: EventSourceLike & { closed: boolean; readyState: number };

  function follow(platform = 'browser') {
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: EVENT_SOURCE,
          useValue: (url: string) => {
            opened.push(url);
            source = {
              onmessage: null,
              onerror: null,
              readyState: 1,
              closed: false,
              close() {
                this.closed = true;
              },
            };
            return source;
          },
        },
        ProcessLog,
      ],
    });
    return TestBed.inject(ProcessLog);
  }

  const send = (frame: ProcessFrame) =>
    source.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }));

  it('reads the process’s stream on qits-workspaces’ origin, and closes it when done', () => {
    const log = follow();
    log.follow('p-1');
    log.follow('p-1');
    expect(opened).toEqual([
      'https://workspaces.test/workspaces/api/technical-processes/p-1/events',
    ]);
    START.forEach(send);
    source.onmessage?.(new MessageEvent('message', { data: 'not json' }));
    expect(log.state().segments).toHaveLength(2);
    send({ kind: 'done', seq: 6, status: 'ok' });
    expect(log.state().outcome).toBe('ok');
    expect(source.closed).toBe(true);
  });

  it('calls a stream the browser gave up on expired', () => {
    const log = follow();
    log.follow('p-gone');
    source.readyState = 2;
    source.onerror?.(new Event('error'));
    expect(log.state().outcome).toBe('expired');
  });

  it('starts over for another process', () => {
    const log = follow();
    log.follow('p-1');
    START.forEach(send);
    const first = source;
    log.follow('p-2');
    expect(first.closed).toBe(true);
    expect(log.state()).toEqual(EMPTY_LOG);
    expect(opened).toHaveLength(2);
  });

  it('never connects on the server', () => {
    const log = follow('server');
    log.follow('p-1');
    expect(opened).toEqual([]);
  });
});
