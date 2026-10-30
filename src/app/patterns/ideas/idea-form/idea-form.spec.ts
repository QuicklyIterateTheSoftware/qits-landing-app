import { TestBed } from '@angular/core/testing';
import { IdeaForm, type IdeaFormValue } from './idea-form';

/** The idea form's counts, hints, refusal and what it hands on (epic qits-888). */
describe('IdeaForm', () => {
  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(IdeaForm);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const submitted: IdeaFormValue[] = [];
    fixture.componentInstance.submitted.subscribe((value) => submitted.push(value));
    const field = <T extends HTMLElement>(label: string) =>
      element.querySelector<T>(`[aria-label="${label}"]`)!;
    const type = (label: string, text: string) => {
      const box = field<HTMLInputElement>(label);
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    const text = (selector: string) => element.querySelector(selector)?.textContent?.trim();
    return { fixture, element, submitted, field, type, button, text };
  }

  it('counts the description’s paragraphs and characters as it is typed', () => {
    const { type, text, element } = render();
    expect(text('[data-paragraphs]')).toBe('0/3 paragraphs');
    expect(text('[data-characters]')).toBe('0/600 characters');
    type('Description', ' One.\n\nTwo.\n\n\nThree.\n\nFour. ');
    expect(text('[data-paragraphs]')).toBe('4/3 paragraphs');
    expect(element.querySelector('[data-paragraphs]')!.classList).toContain('text-cinnabar-700');
    expect(text('[data-characters]')).toBe('26/600 characters');
    type('Description', 'x'.repeat(601));
    expect(text('[data-characters]')).toBe('601/600 characters');
    expect(element.querySelector('[data-characters]')!.classList).toContain('text-cinnabar-700');
  });

  it('hints what is wrong with the title, and keeps Create off while it is blank', () => {
    const { type, button, element } = render();
    expect(button('Create').disabled).toBe(true);
    type('Title', 'Faster builds. Fewer waits. Less cost');
    expect(element.querySelector('[data-title-hint]')?.textContent).toContain("2 '.'");
    // The service decides: a title it will refuse can still be sent.
    expect(button('Create').disabled).toBe(false);
  });

  it('hands on what is typed, and the chosen enabling idea', () => {
    const { type, button, submitted, field, fixture } = render({
      options: [
        { id: 'i1', title: 'Faster builds' },
        { id: 'i2', title: 'Share the cache' },
      ],
    });
    type('Title', 'Nightly rebuilds');
    type('Description', 'Rebuild at night.');
    const select = field<HTMLSelectElement>('Enabled by');
    select.value = 'i2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Create').click();
    expect(submitted).toEqual([
      { title: 'Nightly rebuilds', description: 'Rebuild at night.', enabledBy: 'i2' },
    ]);
  });

  it('starts from the value it is handed, and shows a refusal in the service’s words', () => {
    const { field, fixture, element, button } = render({
      initial: { title: 'Faster builds', description: 'Cache it.', enabledBy: 'i1' },
      options: [{ id: 'i1', title: 'Other' }],
      submitLabel: 'Save',
      refusal: "title has 2 '.' characters; at most one, so one title is one sentence",
    });
    expect(field<HTMLInputElement>('Title').value).toBe('Faster builds');
    expect(field<HTMLTextAreaElement>('Description').value).toBe('Cache it.');
    expect(field<HTMLSelectElement>('Enabled by').value).toBe('i1');
    expect(element.querySelector('[role=alert]')?.textContent).toContain("2 '.' characters");
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(button('Saving…').disabled).toBe(true);
  });
});
