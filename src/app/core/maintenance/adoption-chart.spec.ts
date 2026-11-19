import { maintenanceGoldenMaster } from '../../../testing/golden-masters';
import {
  adoptionCaption,
  adoptionChart,
  CARD_HEIGHT,
  CARD_WIDTH,
  columnX,
  depthLabel,
  edgePath,
  rowY,
  type AdoptionChart,
} from './adoption-chart';
import type { Adopter, AdoptionJourney } from './maintenance.consumes';

/**
 * The adoption flowchart's layout (qits-2333), ported from qits-maintenance-frontend's
 * `adoption-page.spec.ts` layout cases. The cases the chart exists for: one card per repository
 * however many paths reach it, a column per hop, edges only to drawn parents, depth 1 always off
 * the release, and a column ordered by where its parents sit rather than by name. The adopters
 * here are hand-built shapes (a pure function's inputs, not a backend answer), the last case
 * qits-maintenance's recording of "a repository with downstream components".
 */
const ROOT = 'qits-eventstream';
const ADDRESS = { repository: ROOT, version: '2026.905.1' };

const adopter = (over: Partial<Adopter> = {}): Adopter => ({
  repository: 'qits-ci-frontend',
  repositoryStatus: 'OK',
  archetype: 'FRONTEND',
  depth: 1,
  via: [ROOT],
  state: 'ADOPTED',
  adoptedVersion: '2026.905.7',
  adoptedAt: '2026-08-21T09:10:00Z',
  ...over,
});

/** A repository that has not taken the release: the ordinary state, never a failure. */
const pending = (over: Partial<Adopter> = {}): Adopter =>
  adopter({ state: 'PENDING', adoptedVersion: undefined, adoptedAt: undefined, ...over });

const chartOf = (adopters: readonly Adopter[]): AdoptionChart =>
  adoptionChart({ repository: ROOT, version: '2026.905.1', adopters }, ADDRESS);

/** The repositories in one column, top to bottom. */
const column = (chart: AdoptionChart, index: number) =>
  chart.nodes
    .filter((node) => node.column === index)
    .sort((left, right) => left.row - right.row)
    .map((node) => node.repository);

const edges = (chart: AdoptionChart) => chart.edges.map((edge) => `${edge.from}->${edge.to}`);
const node = (chart: AdoptionChart, name: string) => {
  const found = chart.nodes.filter((n) => n.repository === name);
  expect(found.length).toBeLessThan(2);
  return found[0];
};

describe('adoptionChart', () => {
  it('draws nothing when the release reached nobody', () => {
    expect(chartOf([])).toEqual({ columns: [], nodes: [], edges: [], width: 0, height: 0 });
    expect(adoptionChart(undefined, ADDRESS).nodes).toEqual([]);
  });

  it('draws the release itself as the first column', () => {
    const chart = chartOf([adopter()]);
    const root = node(chart, ROOT);
    expect(root?.root).toBe(true);
    expect(root?.column).toBe(0);
    expect(root?.version).toBe('2026.905.1');
    expect(root?.state).toBeNull();
    expect(chart.columns[0]).toMatchObject({ depth: 0, label: 'This release', summary: '' });
  });

  it('falls back to the address for a release the answer leaves out', () => {
    const chart = adoptionChart({ adopters: [adopter()] }, ADDRESS);
    expect(chart.nodes[0]).toMatchObject({ repository: ROOT, version: '2026.905.1', root: true });
  });

  it('puts each repository in the column its distance names, and counts the column', () => {
    const adopters = [
      adopter(),
      pending({ repository: 'qits-idp-frontend', depth: 1 }),
      pending({
        repository: 'qits-ci-service',
        archetype: 'SERVICE',
        depth: 2,
        via: ['qits-ci-frontend'],
      }),
    ];
    const chart = chartOf(adopters);
    expect(column(chart, 0)).toEqual([ROOT]);
    expect(column(chart, 1)).toEqual(['qits-ci-frontend', 'qits-idp-frontend']);
    expect(column(chart, 2)).toEqual(['qits-ci-service']);
    expect(chart.columns[1]).toMatchObject({
      label: '1 hop downstream',
      summary: '1/2 carrying it',
    });
    expect(chart.columns[2]).toMatchObject({
      label: '2 hops downstream',
      summary: '0/1 carrying it',
    });
    expect(adoptionCaption(adopters)).toBe(
      '3 repositories downstream of this release, 1 carrying it.',
    );
  });

  it('gives a column to each distinct depth, not to each number', () => {
    const chart = chartOf([
      adopter(),
      pending({ repository: 'qits-far', depth: 4, via: ['qits-ci-frontend'] }),
    ]);
    expect(chart.columns.map((c) => c.depth)).toEqual([0, 1, 4]);
    expect(node(chart, 'qits-far')?.column).toBe(2);
    expect(chart.columns[2]?.label).toBe('4 hops downstream');
  });

  it('draws a repository two upstreams reach once, with an edge in from each of them', () => {
    const chart = chartOf([
      adopter(),
      adopter({ repository: 'qits-idp-frontend', depth: 1 }),
      pending({
        repository: 'qits-ci-service',
        depth: 2,
        via: ['qits-ci-frontend', 'qits-idp-frontend'],
      }),
    ]);
    expect(chart.nodes.filter((n) => n.repository === 'qits-ci-service')).toHaveLength(1);
    expect(edges(chart)).toEqual([
      `${ROOT}->qits-ci-frontend`,
      `${ROOT}->qits-idp-frontend`,
      'qits-ci-frontend->qits-ci-service',
      'qits-idp-frontend->qits-ci-service',
    ]);
    expect(node(chart, 'qits-ci-service')?.reachedFrom).toBe('qits-ci-frontend, qits-idp-frontend');
  });

  it('keeps one card for a repository the answer lists twice', () => {
    const chart = chartOf([adopter(), adopter({ adoptedVersion: '2026.905.9' })]);
    expect(chart.nodes.map((n) => n.repository)).toEqual([ROOT, 'qits-ci-frontend']);
    expect(node(chart, 'qits-ci-frontend')?.version).toBe('2026.905.7');
  });

  it('joins every depth-1 repository to the release exactly once', () => {
    const chart = chartOf([
      adopter(),
      // A `via` the service would not send, to prove the edge does not depend on it.
      adopter({ repository: 'qits-idp-frontend', depth: 1, via: [] }),
    ]);
    expect(edges(chart)).toEqual([`${ROOT}->qits-ci-frontend`, `${ROOT}->qits-idp-frontend`]);
  });

  it('drops an edge whose parent is not on the chart, and keeps the card', () => {
    const chart = chartOf([
      adopter(),
      pending({ repository: 'qits-ci-service', depth: 2, via: ['qits-never-sent'] }),
    ]);
    expect(node(chart, 'qits-ci-service')).toBeDefined();
    expect(node(chart, 'qits-ci-service')?.reachedFrom).toBe('');
    expect(edges(chart)).toEqual([`${ROOT}->qits-ci-frontend`]);
  });

  it('orders a column by where its parents sit rather than by name', () => {
    const chart = chartOf([
      adopter({ repository: 'qits-b', depth: 1 }),
      adopter({ repository: 'qits-a', depth: 1 }),
      // qits-x hangs off the lower parent and qits-y off the upper one, so name order is wrong.
      pending({ repository: 'qits-x', depth: 2, via: ['qits-b'] }),
      pending({ repository: 'qits-y', depth: 2, via: ['qits-a'] }),
    ]);
    expect(column(chart, 1)).toEqual(['qits-a', 'qits-b']);
    expect(column(chart, 2)).toEqual(['qits-y', 'qits-x']);
  });

  it('sorts a card whose parents are all missing to the end of its column', () => {
    const chart = chartOf([
      adopter(),
      pending({ repository: 'qits-a-orphan', depth: 2, via: ['qits-never-sent'] }),
      pending({ repository: 'qits-z', depth: 2, via: ['qits-ci-frontend'] }),
    ]);
    expect(column(chart, 2)).toEqual(['qits-z', 'qits-a-orphan']);
  });

  it('names the version an adopter carries and when, and says what a pending one waits for', () => {
    const chart = chartOf([
      adopter(),
      pending({ repository: 'qits-idp-frontend', depth: 1 }),
      pending({ repository: 'qits-ci-service', depth: 2, via: ['qits-ci-frontend'] }),
    ]);
    expect(node(chart, 'qits-ci-frontend')).toMatchObject({
      adopted: true,
      state: 'ADOPTED',
      version: '2026.905.7',
      adoptedAt: '2026-08-21T09:10:00Z',
      note: '',
    });
    expect(node(chart, 'qits-idp-frontend')?.note).toBe('has not released with it yet');
    expect(node(chart, 'qits-ci-service')).toMatchObject({
      adopted: false,
      state: 'PENDING',
      note: 'waiting',
    });
  });

  it('links only a repository the inventory holds, and says when one left the catalog', () => {
    const chart = chartOf([
      adopter(),
      adopter({ repository: 'qits-retired', repositoryStatus: 'ABSENT' }),
      adopter({ repository: 'qits-unknown', repositoryStatus: undefined }),
    ]);
    expect(node(chart, 'qits-ci-frontend')?.linkable).toBe(true);
    expect(node(chart, 'qits-retired')).toMatchObject({ linkable: false, absent: true });
    expect(node(chart, 'qits-unknown')).toMatchObject({ linkable: false, absent: false });
  });

  it('places cards on the fixed grid and sizes the box to the tallest column', () => {
    const chart = chartOf([
      adopter(),
      adopter({ repository: 'qits-idp-frontend', depth: 1 }),
      pending({ repository: 'qits-ci-service', depth: 2, via: ['qits-ci-frontend'] }),
    ]);
    expect(node(chart, 'qits-idp-frontend')).toMatchObject({ x: 324, y: 46 + 132 });
    expect(chart.width).toBe(columnX(2) + CARD_WIDTH);
    expect(chart.height).toBe(rowY(1) + CARD_HEIGHT);
    expect(chart.edges[0]?.path).toBe(
      edgePath(CARD_WIDTH, rowY(0) + CARD_HEIGHT / 2, columnX(1), rowY(0) + CARD_HEIGHT / 2),
    );
  });

  it('curves an edge out and in horizontally, with a floor under its reach', () => {
    expect(edgePath(240, 104, 324, 236)).toBe('M 240 104 C 282 104, 282 236, 324 236');
    expect(edgePath(0, 0, 40, 10)).toBe('M 0 0 C 28 0, 12 10, 40 10');
  });

  it('says a column’s distance in words', () => {
    expect(depthLabel(0)).toBe('This release');
    expect(depthLabel(1)).toBe('1 hop downstream');
    expect(depthLabel(3)).toBe('3 hops downstream');
  });

  it('pluralises the caption', () => {
    expect(adoptionCaption([adopter()])).toBe(
      '1 repository downstream of this release, 1 carrying it.',
    );
  });

  it('draws the recorded journey of "a repository with downstream components"', () => {
    const journey = maintenanceGoldenMaster<AdoptionJourney>(
      'a repository with downstream components',
      'getAdoptionByRelease',
    );
    const chart = adoptionChart(journey, { repository: '', version: '' });
    expect(chart.nodes.map((n) => [n.column, n.repository])).toEqual([
      [0, 'contract-ui-jslib'],
      [1, 'contract-frontend'],
      [2, 'contract-service'],
    ]);
    expect(edges(chart)).toEqual([
      'contract-ui-jslib->contract-frontend',
      'contract-frontend->contract-service',
    ]);
    expect(chart.columns.map((c) => c.summary)).toEqual(['', '0/1 carrying it', '0/1 carrying it']);
  });
});
