import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** One entry of the sidebar. */
interface NavLink {
  readonly label: string;
  readonly path: string;
}

/**
 * The platform's one layout: a top bar, a sidebar and the page. Mounted as the root route
 * component, so it survives navigation and only the outlet changes.
 *
 * From 768px up the sidebar is always shown. Below that, the burger shows and hides it. The
 * breakpoint is CSS, so the server renders the same markup as the browser.
 */
@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="layout" [class.nav-open]="navOpen()">
      <header class="bar">
        <button
          type="button"
          class="burger"
          aria-controls="layout-nav"
          [attr.aria-expanded]="navOpen()"
          aria-label="Navigation"
          (click)="toggleNav()"
        >
          <span></span><span></span><span></span>
        </button>
        <a class="brand" routerLink="/">qits</a>
      </header>

      <nav id="layout-nav" class="nav" aria-label="qits">
        <ul>
          @for (link of links; track link.path) {
            <li>
              <a
                [routerLink]="link.path"
                routerLinkActive="current"
                [routerLinkActiveOptions]="{ exact: true }"
                ariaCurrentWhenActive="page"
                (click)="closeNav()"
                >{{ link.label }}</a
              >
            </li>
          }
        </ul>
      </nav>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .layout {
      display: grid;
      grid-template-areas:
        'bar'
        'content';
      grid-template-rows: 3.5rem 1fr;
      min-height: 100vh;
    }

    .bar {
      grid-area: bar;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 1rem;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .brand {
      color: #111827;
      font-weight: 700;
      text-decoration: none;
    }

    .burger {
      display: inline-flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0.5rem;
      border: 0;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
    }

    .burger span {
      display: block;
      height: 2px;
      background: #374151;
    }

    .nav {
      display: none;
      grid-area: content;
      z-index: 1;
      background: #f9fafb;
      border-right: 1px solid #e5e7eb;
    }

    .nav-open .nav {
      display: block;
    }

    .nav ul {
      list-style: none;
      margin: 0;
      padding: 0.75rem 0.5rem;
    }

    .nav a {
      display: block;
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      color: #374151;
      text-decoration: none;
    }

    .nav a:hover {
      background: #f3f4f6;
    }

    .nav a.current {
      background: #e5e7eb;
      color: #111827;
      font-weight: 600;
    }

    .content {
      grid-area: content;
      min-width: 0;
    }

    @media (min-width: 768px) {
      .layout {
        grid-template-areas:
          'bar bar'
          'nav content';
        grid-template-columns: 15rem 1fr;
      }

      .burger {
        display: none;
      }

      .nav {
        display: block;
        grid-area: nav;
      }
    }
  `,
})
export class Layout {
  protected readonly links: readonly NavLink[] = [{ label: 'Home', path: '/' }];

  protected readonly navOpen = signal(false);

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }
}
