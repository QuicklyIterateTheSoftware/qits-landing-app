import { systemTerminalSocketUrl } from './terminal-socket-url';

describe('systemTerminalSocketUrl', () => {
  it('is the terminal’s socket on qits-system’s origin', () => {
    expect(
      systemTerminalSocketUrl(
        'https://system.qits.example',
        '00000000-0000-4000-8000-000000000003',
      ),
    ).toBe('wss://system.qits.example/system/api/terminals/00000000-0000-4000-8000-000000000003');
  });

  it('keeps ws: for an http: origin, drops a trailing slash and encodes the id', () => {
    expect(systemTerminalSocketUrl('http://localhost:8080/', 'a b/c')).toBe(
      'ws://localhost:8080/system/api/terminals/a%20b%2Fc',
    );
  });
});
