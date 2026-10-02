import { platformOrigin } from './platform-host';

describe('platformOrigin', () => {
  it('swaps the first label of this host for the application', () => {
    expect(
      platformOrigin('workspaces', { protocol: 'https:', hostname: 'landing.qits.wohlben.eu' }),
    ).toBe('https://workspaces.qits.wohlben.eu');
  });

  it('uses the platform domain when served from localhost or an address', () => {
    expect(platformOrigin('workspaces', { protocol: 'http:', hostname: 'localhost' })).toBe(
      'https://workspaces.qits.wohlben.eu',
    );
    expect(platformOrigin('workspaces', { protocol: 'http:', hostname: '127.0.0.1' })).toBe(
      'https://workspaces.qits.wohlben.eu',
    );
  });
});
