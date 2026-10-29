import { containerBase, containerTerminalSocketUrl } from './container-proxy';

describe('container proxy addresses', () => {
  it('is the slot daemon’s base behind qits-workspaces’ container proxy', () => {
    expect(containerBase('https://workspaces.qits.example', 7)).toBe(
      'https://workspaces.qits.example/workspaces/container/7',
    );
  });

  it('is a slot command’s terminal socket, as ws(s)', () => {
    expect(containerTerminalSocketUrl('https://workspaces.qits.example', 7, 'c 1')).toBe(
      'wss://workspaces.qits.example/workspaces/container/7/terminal/commands/c%201',
    );
    expect(containerTerminalSocketUrl('http://localhost:8080', 7, 'c1')).toBe(
      'ws://localhost:8080/workspaces/container/7/terminal/commands/c1',
    );
  });
});
