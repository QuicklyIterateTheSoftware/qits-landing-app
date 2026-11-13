import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, type QitsResourceRef } from '@qits/angular';
import type { DossierPages } from '$core/work/work-detail.consumes';
import { Markdown } from '$ui/components/markdown/markdown';

/**
 * A work item's dossier (an epic's or a ticket's): each page a collapsible section, open at first,
 * its title the summary and its body Markdown. A figure the page names by one of `figures`' keys
 * loads from that key's value (an epic's figures, from qits-projects' API). "No pages yet" for
 * none. A region named "Dossier". `pages` is the work item page's read (`WORK_DOSSIER`, qits-2146);
 * each page marks itself (`qitsEntity` by `id`), its title and its body.
 */
@Component({
  selector: 'app-work-dossier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, QitsEntity, QitsEntityList, QitsField],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Dossier" [qitsEntityList]="pages()">
      <h2 class="m-0 text-base font-semibold text-fg">Dossier</h2>
      @for (page of answer()?.pages ?? []; track page.id) {
        <details
          open
          class="group rounded-md border border-line"
          [qitsEntity]="page"
          entityKey="id"
        >
          <summary
            class="cursor-pointer px-4 py-2 text-sm font-semibold text-fg select-none"
            [fieldOf]="page"
            qitsField="title"
          >
            {{ page.title }}
          </summary>
          <div class="border-t border-line px-4 py-3">
            <ui-markdown
              [fieldOf]="page"
              qitsField="body"
              [text]="page.body ?? ''"
              [resolveUrl]="resolve()"
            />
          </div>
        </details>
      }
      <p class="m-0 text-sm text-fg-muted" [class.hidden]="count()">No pages yet</p>
    </section>
  `,
})
export class WorkDossier {
  /** The dossier's pages: the work item page's read. */
  readonly pages = input.required<QitsResourceRef<DossierPages>>();

  /** The pages as read; none until they are in, and after a failed first read. */
  protected readonly answer = computed(() => {
    const read = this.pages();
    return read.hasValue() ? read.value() : undefined;
  });

  protected readonly count = computed(() => this.answer()?.pages?.length ?? 0);
  /** Where each figure loads from, by the address the pages name it with. */
  readonly figures = input<Readonly<Record<string, string>>>({});

  protected readonly resolve = computed(() => {
    const figures = this.figures();
    return (url: string) => figures[url] ?? url;
  });
}
