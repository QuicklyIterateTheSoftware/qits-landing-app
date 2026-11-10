import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IN_PROGRESS_VIEW_KEY, InProgressViewStore } from './in-progress-view';

/**
 * The In Progress tab's view setting (qits-2051) on jsdom's `localStorage`: the default, the stored
 * value applied only after the first render, an unknown value, and a storage that throws.
 */
describe('InProgressViewStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** The store in a browser (or on the server), before and after the first render. */
  function store(platform: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    const views = TestBed.inject(InProgressViewStore);
    const before = views.view();
    TestBed.tick();
    return { views, before };
  }

  it('uses the epic boards view when nothing is stored', () => {
    const { views, before } = store();
    expect(before).toBe('epics');
    expect(views.view()).toBe('epics');
  });

  it('applies the stored view only after the first render, so hydration meets the default', () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
    const { views, before } = store();
    expect(before).toBe('epics');
    expect(views.view()).toBe('inline');
  });

  it('keeps the default on the server, whatever is stored', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { views } = store('server');
    expect(views.view()).toBe('epics');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('reads an unknown stored value as the default', () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'swimlanes');
    expect(store().views.view()).toBe('epics');
  });

  it('applies a choice at once and stores it', () => {
    const { views } = store();
    views.set('inline');
    expect(views.view()).toBe('inline');
    expect(localStorage.getItem(IN_PROGRESS_VIEW_KEY)).toBe('inline');
    views.set('epics');
    expect(localStorage.getItem(IN_PROGRESS_VIEW_KEY)).toBe('epics');
  });

  it('keeps a choice made before the first render over the stored one', () => {
    localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'epics');
    TestBed.configureTestingModule({});
    const views = TestBed.inject(InProgressViewStore);
    views.set('inline');
    TestBed.tick();
    expect(views.view()).toBe('inline');
  });

  it('uses the default and still switches for the visit when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { views } = store();
    expect(views.view()).toBe('epics');
    views.set('inline');
    expect(views.view()).toBe('inline');
  });
});
