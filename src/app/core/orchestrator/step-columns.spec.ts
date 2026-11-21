import { columns, depths, type GraphNode } from './step-columns';

/**
 * The steps board's arrangement (qits-2359), asserted as arithmetic rather than as pixels, ported
 * with qits-orchestrator-frontend's `board/layout.spec.ts`. The graph is the gc process's shape
 * (the old plan's nine steps).
 */
describe('step columns', () => {
  const node = (id: string, ...dependsOn: string[]): GraphNode => ({ id, dependsOn });

  const GC: readonly GraphNode[] = [
    node('usage.before'),
    node('pins.deployments'),
    node('pins.ci'),
    node('artifacts.plan', 'pins.deployments', 'pins.ci'),
    node('artifacts.sweep', 'artifacts.plan'),
    node('containers.images', 'pins.deployments'),
    node('containers.volumes', 'usage.before'),
    node('containers.build-cache', 'containers.images'),
    node(
      'usage.after',
      'artifacts.sweep',
      'containers.images',
      'containers.volumes',
      'containers.build-cache',
    ),
  ];

  describe('depth', () => {
    it('puts everything that waits for nothing in the first column', () => {
      const depth = depths(GC);
      expect(depth.get('usage.before')).toBe(0);
      expect(depth.get('pins.deployments')).toBe(0);
      expect(depth.get('pins.ci')).toBe(0);
    });

    it('puts a step one past the deepest step it waits for', () => {
      const depth = depths(GC);
      expect(depth.get('artifacts.plan')).toBe(1);
      expect(depth.get('artifacts.sweep')).toBe(2);
      expect(depth.get('containers.images')).toBe(1);
      expect(depth.get('containers.volumes')).toBe(1);
      expect(depth.get('containers.build-cache')).toBe(2);
      // Its deepest dependency is artifacts.sweep at 2, not containers.volumes at 1.
      expect(depth.get('usage.after')).toBe(3);
    });

    it('ignores a dependency naming a step that is not on the board', () => {
      expect(depths([node('a'), node('b', 'a', 'ghost')]).get('b')).toBe(1);
    });

    it('resolves a cycle instead of recursing forever', () => {
      const depth = depths([node('a', 'b'), node('b', 'a')]);
      expect(depth.size).toBe(2);
      expect(depth.get('b')).toBe(1);
      expect(depth.get('a')).toBe(2);
    });

    it('reads a step without a dependsOn as waiting for nothing', () => {
      expect(depths([{ id: 'a' }, node('b', 'a')]).get('a')).toBe(0);
    });
  });

  describe('columns', () => {
    it('groups the steps into left-to-right columns, in the service’s order within each', () => {
      expect(columns(GC).map((column) => column.map((step) => step.id))).toEqual([
        ['usage.before', 'pins.deployments', 'pins.ci'],
        ['artifacts.plan', 'containers.images', 'containers.volumes'],
        ['artifacts.sweep', 'containers.build-cache'],
        ['usage.after'],
      ]);
    });

    it('keeps the steps themselves, not copies', () => {
      const [first] = columns(GC);
      expect(first[0]).toBe(GC[0]);
    });

    it('has no columns for a run without steps', () => {
      expect(columns([])).toEqual([]);
    });

    it('lays a cycle out over adjacent columns', () => {
      expect(
        columns([node('a', 'b'), node('b', 'a')]).map((column) => column.map((s) => s.id)),
      ).toEqual([[], ['b'], ['a']]);
    });
  });
});
