import { Injectable, signal } from '@angular/core';

/** What the trail names an open deployment request by. */
export interface OpenDeploymentRequestName {
  readonly id: string;
  readonly version?: string | null;
  readonly applicationName?: string | null;
}

/**
 * The deployment request whose page is open (qits-2322), as far as the shell's trail names it:
 * `<version> · <applicationName>`. The request's page reads the request itself (`DEPLOYMENT_REQUEST`)
 * and tells this root service what it shows (`show`), and lets go of it when it closes (`clear`);
 * the shell, above the page, reads `shown()`. It holds no read of its own: nothing is requested
 * twice.
 */
@Injectable({ providedIn: 'root' })
export class OpenDeploymentRequest {
  private readonly current = signal<OpenDeploymentRequestName | undefined>(undefined);

  /** The request on show, once its page read it. */
  readonly shown = this.current.asReadonly();

  /** The page shows `request`. */
  show(request: OpenDeploymentRequestName): void {
    const shown = this.current();
    if (
      shown?.id === request.id &&
      shown.version === request.version &&
      shown.applicationName === request.applicationName
    )
      return;
    this.current.set({
      id: request.id,
      version: request.version,
      applicationName: request.applicationName,
    });
  }

  /** The page of `id` closed; a newer page's request stays. */
  clear(id: string): void {
    if (this.current()?.id === id) this.current.set(undefined);
  }
}
