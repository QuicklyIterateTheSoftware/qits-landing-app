import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DossierPage } from '$core/work/work-detail.consumes';
import { Markdown } from '$ui/components/markdown/markdown';

/**
 * A work item's dossier (an epic's or a ticket's): each page a collapsible section, open at first,
 * its title the summary and its body Markdown. A figure the page names by one of `figures`' keys
 * loads from that key's value (an epic's figures, from qits-projects' API). "No pages yet" for
 * none. A region named "Dossier".
 */
@Component({
  selector: 'app-work-dossier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Dossier">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Dossier</h2>
      @for (page of pages(); track page.id) {
        <details open class="group rounded-md border border-charcoal-brown-200">
          <summary
            class="cursor-pointer px-4 py-2 text-sm font-semibold text-charcoal-brown-900 select-none"
          >
            {{ page.title }}
          </summary>
          <div class="border-t border-charcoal-brown-200 px-4 py-3">
            <ui-markdown [text]="page.body ?? ''" [resolveUrl]="resolve()" />
          </div>
        </details>
      }
      <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="pages().length">
        No pages yet
      </p>
    </section>
  `,
})
export class WorkDossier {
  readonly pages = input.required<readonly DossierPage[]>();
  /** Where each figure loads from, by the address the pages name it with. */
  readonly figures = input<Readonly<Record<string, string>>>({});

  protected readonly resolve = computed(() => {
    const figures = this.figures();
    return (url: string) => figures[url] ?? url;
  });
}
