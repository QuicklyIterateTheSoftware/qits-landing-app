import { place, type TriggerBox } from './placement';

const WINDOW = { width: 1280, height: 800 };
const PANEL = { width: 448, height: 300 };

/** A 100x24 trigger with its top-left corner at (`left`, `top`). */
const at = (left: number, top: number): TriggerBox => ({
  left,
  top,
  right: left + 100,
  bottom: top + 24,
});

describe('place', () => {
  it('hangs the panel below the trigger, left edges lined up with align="start"', () => {
    expect(place(at(200, 100), PANEL, WINDOW, { align: 'start', gap: 4 })).toEqual({
      top: 128,
      left: 200,
      maxHeight: null,
      side: 'below',
    });
  });

  it('lines the right edges up with align="end"', () => {
    expect(place(at(800, 100), PANEL, WINDOW, { align: 'end' })).toEqual({
      top: 124,
      left: 900 - 448,
      maxHeight: null,
      side: 'below',
    });
  });

  it('hangs from the other edge where the align side has no room', () => {
    // start: the panel would run past the window's right edge, so its right edge lines up instead.
    expect(place(at(1100, 100), PANEL, WINDOW, { align: 'start' }).left).toBe(1200 - 448);
    // end: the panel would start left of the window, so its left edge lines up instead.
    expect(place(at(100, 100), PANEL, WINDOW, { align: 'end' }).left).toBe(100);
  });

  it('clamps the panel inside the window, 8px from its edges, where neither edge fits', () => {
    const wide = { width: 1200, height: 100 };
    expect(place(at(600, 100), wide, WINDOW, { align: 'start' }).left).toBe(1280 - 8 - 1200);
    expect(place(at(600, 100), wide, WINDOW, { align: 'end' }).left).toBe(8);
    const wider = { width: 1400, height: 100 };
    expect(place(at(600, 100), wider, WINDOW, { align: 'end' }).left).toBe(8);
    expect(place(at(600, 100), PANEL, WINDOW, { align: 'start', margin: 20 }).left).toBe(600);
  });

  it('goes above the trigger where there is no room below', () => {
    expect(place(at(200, 600), PANEL, WINDOW, { align: 'start', gap: 4 })).toEqual({
      top: 600 - 4 - 300,
      left: 200,
      maxHeight: null,
      side: 'above',
    });
  });

  it('stays below when it fits exactly, 8px above the window’s bottom', () => {
    const trigger = at(200, 800 - 8 - 300 - 24);
    expect(place(trigger, PANEL, WINDOW, { align: 'start' }).side).toBe('below');
  });

  it('caps the panel to the larger side where it fits neither below nor above', () => {
    const tall = { width: 300, height: 700 };
    // 476px below (800 - 8 - 316), 284px above (292 - 8): below, capped.
    expect(place(at(200, 292), tall, WINDOW, { align: 'start' })).toEqual({
      top: 316,
      left: 200,
      maxHeight: 476,
      side: 'below',
    });
    // 192px below (800 - 8 - 600), 568px above (576 - 8): above, capped, 8px from the top.
    expect(place(at(200, 576), tall, WINDOW, { align: 'start' })).toEqual({
      top: 8,
      left: 200,
      maxHeight: 568,
      side: 'above',
    });
  });

  it('keeps a panel inside the window when its trigger is scrolled out of it', () => {
    const placed = place(at(200, -200), PANEL, WINDOW, { align: 'start' });
    expect(placed.side).toBe('below');
    expect(placed.top).toBe(8);
  });
});
