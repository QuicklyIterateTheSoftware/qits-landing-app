import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { WorkspaceHints } from './workspace-hints';

describe('WorkspaceHints', () => {
  let opened: string[];
  let source: EventSourceLike & { closed: boolean };

  function hints(platform = 'browser') {
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
        WorkspaceHints,
      ],
    });
    return TestBed.inject(WorkspaceHints);
  }

  const hint = (topic: string) => source.onmessage?.(new MessageEvent('message', { data: topic }));

  it('reads the slot’s hint channel on qits-workspaces’ origin, once per slot', () => {
    const channel = hints();
    channel.watch(1);
    channel.watch(1);
    expect(opened).toEqual(['https://workspaces.test/workspaces/api/workspaces/1/events']);
  });

  it('counts each topic it knows, and ignores pings and topics it does not', () => {
    const channel = hints();
    channel.watch(1);
    hint('commands');
    hint('prompt-draft');
    hint('prompt-draft');
    hint('ping');
    hint('telemetry');
    expect(channel.hints('commands')()).toBe(1);
    expect(channel.hints('prompt-draft')()).toBe(2);
  });

  it('moves every counter on the first frame after the stream erred: the gap is read again', () => {
    const channel = hints();
    channel.watch(1);
    source.onerror?.(new Event('error'));
    hint('ping');
    expect(channel.hints('commands')()).toBe(1);
    expect(channel.hints('prompt-draft')()).toBe(1);
  });

  it('moves to another slot, and closes for none', () => {
    const channel = hints();
    channel.watch(1);
    const first = source;
    channel.watch(2);
    expect(first.closed).toBe(true);
    const second = source;
    channel.watch(0);
    expect(second.closed).toBe(true);
    expect(opened).toHaveLength(2);
  });

  it('never connects on the server', () => {
    hints('server').watch(1);
    expect(opened).toEqual([]);
  });
});
