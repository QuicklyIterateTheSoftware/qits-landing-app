import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore, type PendingFinish } from '$core/work/work.store';
import { FinishToasts } from './finish-toasts';

const pending = (qualifiedId: string, phase: PendingFinish['phase']): PendingFinish => ({
  projectId: 'p-1',
  entry: { id: qualifiedId, qualifiedId } as WorkEntry,
  phase,
});

describe('FinishToasts', () => {
  const pendingFinishes = signal<Record<string, PendingFinish>>({});
  const undoFinish = vi.fn();
  const dismissFinish = vi.fn();

  beforeEach(() => {
    undoFinish.mockReset();
    dismissFinish.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: WorkStore, useValue: { pendingFinishes, undoFinish, dismissFinish } }],
    });
  });

  function render(value: Record<string, PendingFinish>) {
    pendingFinishes.set(value);
    const fixture = TestBed.createComponent(FinishToasts);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toasts = [...element.querySelectorAll('ui-toast')] as HTMLElement[];
    return toasts.map((toast) => ({
      text: toast.querySelector('span')?.textContent?.trim(),
      button: toast.querySelector('button') as HTMLButtonElement,
    }));
  }

  it('shows one toast per pending finish, oldest first', () => {
    const toasts = render({
      'qits-1': pending('qits-1', 'waiting'),
      'qits-2': pending('qits-2', 'sending'),
      'qits-3': pending('qits-3', 'failed'),
    });
    expect(toasts.map((t) => t.text)).toEqual([
      'qits-1 finished',
      'qits-2 finished',
      'qits-3 could not be finished. It is back on the board.',
    ]);
    expect(toasts.map((t) => t.button.textContent?.trim())).toEqual(['Undo', '', 'Dismiss']);
    // A finish being sent can no longer be undone: its button is hidden by class.
    expect(toasts[1].button.classList.contains('hidden')).toBe(true);
  });

  it('undoes a waiting finish', () => {
    render({ 'qits-1': pending('qits-1', 'waiting') })[0].button.click();
    expect(undoFinish).toHaveBeenCalledWith('qits-1');
    expect(dismissFinish).not.toHaveBeenCalled();
  });

  it('dismisses a failed finish', () => {
    render({ 'qits-3': pending('qits-3', 'failed') })[0].button.click();
    expect(dismissFinish).toHaveBeenCalledWith('qits-3');
    expect(undoFinish).not.toHaveBeenCalled();
  });
});
