import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Landing } from './landing/landing';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('Landing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
    }).compileComponents();
  });

  /**
   * The claim this repository exists to keep: the page's visible text is IN THE TEMPLATE, so it is
   * in whatever html the renderer produces — the browser's and the server's alike. A test that
   * asserted on a fetched string would pass against a page that server-renders empty.
   */
  it('renders the platform headline without waiting for anything', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.querySelector('h1')?.textContent).toContain('The qits platform');
    expect(rendered.querySelectorAll('.capability').length).toBe(4);
  });
});
