import {
  emptyReason,
  sortOf,
  thresholdOf,
  TRACE_THRESHOLDS_MS,
  tracesQuery,
  truncationSentence,
  viewOf,
} from './traces';

describe('traces', () => {
  it('reads ?sort= as duration or, by default, recent', () => {
    expect(sortOf('duration')).toBe('duration');
    expect(sortOf('recent')).toBe('recent');
    expect(sortOf(null)).toBe('recent');
    expect(sortOf('DURATION')).toBe('recent');
  });

  it('reads ?view= as flat or, by default, grouped', () => {
    expect(viewOf('flat')).toBe('flat');
    expect(viewOf(null)).toBe('grouped');
    expect(viewOf('grouped')).toBe('grouped');
    expect(viewOf('table')).toBe('grouped');
  });

  it('reads ?threshold= as a positive whole floor, and nonsense as no floor', () => {
    expect(TRACE_THRESHOLDS_MS).toEqual([0, 10, 100, 500, 1000]);
    expect(thresholdOf(null)).toBe(0);
    expect(thresholdOf('')).toBe(0);
    expect(thresholdOf('0')).toBe(0);
    expect(thresholdOf('500')).toBe(500);
    expect(thresholdOf('250.7')).toBe(250);
    expect(thresholdOf('-10')).toBe(0);
    expect(thresholdOf('slow')).toBe(0);
    expect(thresholdOf('Infinity')).toBe(0);
  });

  it('sends the source alone by default, and each lens only when it is not the default', () => {
    const defaults = {
      source: '_service/qits-example',
      sort: 'recent' as const,
      thresholdMs: 0,
      service: undefined,
      sinceMinutes: undefined,
    };
    expect(tracesQuery(defaults)).toEqual({ source: '_service/qits-example' });
    expect(
      tracesQuery({
        ...defaults,
        sort: 'duration',
        thresholdMs: 100,
        service: 'qits-example',
        sinceMinutes: 60,
      }),
    ).toEqual({
      source: '_service/qits-example',
      sort: 'duration',
      thresholdMs: 100,
      service: 'qits-example',
      sinceMinutes: 60,
    });
  });

  it('says what a truncated answer kept, by the order it was read in', () => {
    expect(truncationSentence(200, 312, 'recent')).toBe(
      'Showing the newest 200 of 312 matching traces',
    );
    expect(truncationSentence(200, 312, 'duration')).toBe(
      'Showing the slowest 200 of 312 matching traces',
    );
  });

  it('puts an empty list down to no source, no spans, the service, the floor, then the range', () => {
    const view = {
      source: '_service/qits-example',
      sourceSpans: 3,
      service: 'elsewhere',
      services: ['qits-example'],
      thresholdMs: 500,
      sinceMinutes: 60,
    };
    expect(emptyReason({ ...view, source: undefined })).toBe('no-source');
    expect(emptyReason({ ...view, sourceSpans: 0 })).toBe('no-spans');
    expect(emptyReason(view)).toBe('unknown-service');
    expect(emptyReason({ ...view, services: undefined })).toBe('below-floor');
    expect(emptyReason({ ...view, service: 'qits-example' })).toBe('below-floor');
    expect(emptyReason({ ...view, service: undefined, thresholdMs: 0 })).toBe('outside-window');
    expect(
      emptyReason({ ...view, service: undefined, thresholdMs: 0, sinceMinutes: undefined }),
    ).toBe('none');
  });
});
