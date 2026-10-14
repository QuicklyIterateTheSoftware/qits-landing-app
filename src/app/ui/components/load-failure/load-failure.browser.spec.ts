import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { LoadFailure } from './load-failure';

/** Screenshots of a failed read: a short message, and one that wraps. */
@Component({
  imports: [LoadFailure],
  host: { class: 'flex w-[32rem] flex-col gap-2 p-4' },
  template: `
    <ui-load-failure message="The release request could not be read." />
    <ui-load-failure
      message="The release requests could not be read. The service did not answer, or answered with an error."
    />
  `,
})
class Variants {}

describe('LoadFailure (screenshots)', () => {
  it('draws the message and the Retry button', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    const view = page.elementLocator(fixture.nativeElement);
    await expect.element(view.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
    await expect.element(view).toMatchScreenshot('messages');
  });
});
