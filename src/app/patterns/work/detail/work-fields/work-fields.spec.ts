import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideQitsWorkBriefs } from '@qits/ui-components';
import { WorkFields, type WorkField } from './work-fields';

describe('WorkFields', () => {
  /** The briefs the values' work ids ask for, by project. */
  let asked: [string, readonly string[]][];

  beforeEach(() => {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideQitsWorkBriefs(async (project, ids) => {
          asked.push([project, ids]);
          return [];
        }),
      ],
    });
  });

  async function render(fields: readonly WorkField[]) {
    const fixture = TestBed.createComponent(WorkFields);
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    return fixture.nativeElement as HTMLElement;
  }

  it("draws the work ids of a prose value's project as references (qits-1898)", async () => {
    const element = await render([
      { label: 'Impetus', value: 'Found while verifying qits-12.', workProject: 'qits' },
    ]);
    const value = element.querySelector('dd > span')!;
    expect(value.querySelector('qits-work-ref')?.textContent?.trim()).toBe('qits-12');
    expect(value.textContent?.trim()).toBe('Found while verifying qits-12.');
    expect(asked).toEqual([['qits', ['qits-12']]]);
  });

  it('leaves a value without a project as plain text', async () => {
    const element = await render([{ label: 'Assignee', value: 'qits-12', code: true }]);
    const value = element.querySelector('dd > span')!;
    expect(value.querySelector('qits-work-ref')).toBeNull();
    expect(value.textContent).toBe('qits-12');
    expect(asked).toEqual([]);
  });
});
