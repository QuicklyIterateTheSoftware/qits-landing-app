import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, PLATFORM_ID } from '@angular/core';
import { QitsEntity, QitsField, qitsResource } from '@qits/angular';
import { QitsCommitMessage } from '@qits/ui-components';
import { WORK_ITEM } from '$core/work/work.operations';

/**
 * An open issue's description on the Desk (qits-1819), read on its own (`WORK_ITEM`, the issue's
 * `getWork`, through a `qitsResource` in the browser only, qits-2146): the list row has none. The
 * work ids of the project in it are drawn as work references with their briefs
 * (`<qits-commit-message>`, qits-1898). Nothing shows until it is read, nor when the read fails.
 *
 * Marks (qits-2141): the issue, by its id, from that read, and its `description`.
 *
 * Staleness (qits-1270): read once per issue shown; no event marks an item's description edited
 * (see `WorkDetailStore`).
 */
@Component({
  selector: 'app-issue-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsCommitMessage, QitsEntity, QitsField],
  template: `
    @if (read.hasValue() ? read.value() : undefined; as issue) {
      <qits-commit-message
        [message]="issue.description ?? ''"
        [project]="slug()"
        [qitsEntity]="issue"
        entityKey="id"
        [entitySource]="read"
        [fieldOf]="issue"
        qitsField="description"
      />
    } @else {
      <qits-commit-message message="" [project]="slug()" />
    }
  `,
})
export class IssueDescription {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The issue's qualified id. */
  readonly qualifiedId = input.required<string>();
  /** The project's slug, for the work references. */
  readonly slug = input.required<string>();

  /** The issue, in the browser only. */
  protected readonly read = qitsResource(WORK_ITEM, () => {
    const qualifiedId = this.qualifiedId();
    return this.browser && qualifiedId ? { path: { qualifiedId } } : undefined;
  });
}
