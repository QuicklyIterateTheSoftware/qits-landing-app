import { asksForTasks } from './swarm-service';

describe('asksForTasks (qits-2345)', () => {
  it('is true for a replicated service that desires replicas', () => {
    expect(asksForTasks({ mode: 'replicated', replicas: '0/1' })).toBe(true);
    expect(asksForTasks({ mode: 'replicated', replicas: '2/3' })).toBe(true);
  });

  it('is false for a service scaled to 0, a global one, or no count', () => {
    expect(asksForTasks({ mode: 'replicated', replicas: '0/0' })).toBe(false);
    expect(asksForTasks({ mode: 'global', replicas: '0/0' })).toBe(false);
    expect(asksForTasks({ mode: 'replicated', replicas: undefined })).toBe(false);
  });
});
