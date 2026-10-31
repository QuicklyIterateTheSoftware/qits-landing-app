import { byIdeaRank, inIdeaRank, rankableIdea } from './idea-rank';

/** The ideas' order and which ideas can be ranked (qits-1791): pure functions. */
describe('byIdeaRank', () => {
  const titles = (ideas: readonly { title: string }[]) => ideas.map((idea) => idea.title);

  it('puts a higher priority first, whatever the age', () => {
    const ideas = [
      { title: 'old', priority: 1 },
      { title: 'new', priority: 3 },
    ];
    expect(titles(inIdeaRank(ideas))).toEqual(['new', 'old']);
  });

  it('puts an idea nobody ranked after every ranked one', () => {
    const ideas = [
      { title: 'unranked', priority: null },
      { title: 'low', priority: 1 },
      { title: 'missing' },
      { title: 'high', priority: 5 },
    ];
    expect(titles(inIdeaRank(ideas))).toEqual(['high', 'low', 'unranked', 'missing']);
  });

  it('keeps the service’s order for ties', () => {
    const ideas = [
      { title: 'a', priority: null },
      { title: 'b', priority: 2 },
      { title: 'c', priority: null },
      { title: 'd', priority: 2 },
    ];
    expect(titles(inIdeaRank(ideas))).toEqual(['b', 'd', 'a', 'c']);
    expect(byIdeaRank({ priority: 2 }, { priority: 2 })).toBe(0);
    expect(byIdeaRank({ priority: null }, {})).toBe(0);
  });

  it('leaves its input as it was', () => {
    const ideas = [{ priority: 1 }, { priority: 2 }];
    inIdeaRank(ideas);
    expect(ideas[0]?.priority).toBe(1);
  });
});

describe('rankableIdea', () => {
  it('ranks open ideas only: not archived, not DONE', () => {
    expect(rankableIdea({ status: 'PLANNED', archived: false })).toBe(true);
    expect(rankableIdea({ status: 'QUEUED', archived: false })).toBe(true);
    expect(rankableIdea({ status: 'DONE', archived: false })).toBe(false);
    expect(rankableIdea({ status: 'PLANNED', archived: true })).toBe(false);
  });
});
