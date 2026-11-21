import { TestBed } from '@angular/core/testing';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { IdpFrame, type IdpAdminPage } from './idp-frame';

function render(page: IdpAdminPage, idp?: string) {
  TestBed.configureTestingModule({
    providers: [provideTestPlatformOrigins({}, idp ? { idp } : {})],
  });
  const fixture = TestBed.createComponent(IdpFrame);
  fixture.componentRef.setInput('page', page);
  fixture.componentRef.setInput('title', 'IdP admin: Users');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('IdpFrame (qits-2481)', () => {
  it('frames the idp’s admin page on the idp’s origin', () => {
    const frame = render('users', 'https://idp.qits.example.test').querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('https://idp.qits.example.test/idp/users');
    expect(frame?.getAttribute('title')).toBe('IdP admin: Users');
  });

  it('draws no frame while the idp’s origin is not known (the server render)', () => {
    expect(render('clients').querySelector('iframe')).toBeNull();
  });
});
