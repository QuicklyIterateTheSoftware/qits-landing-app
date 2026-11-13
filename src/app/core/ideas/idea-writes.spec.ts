import { QitsApiError } from '@qits/angular';
import {
  archiveIdeaParams,
  createIdeaParams,
  ideaRefusal,
  ideaRunRefusal,
  patchIdeaParams,
  reprioritizeIdeaParams,
  withPriorities,
} from './idea-writes';

/** What the idea writes send and make of the answers (epic qits-888), formerly `IdeasStore`'s. */
describe('idea writes', () => {
  it('creates an idea, sending only what is filled in, trimmed', () => {
    expect(createIdeaParams('p1', { title: ' Faster builds ', description: '  ' })).toEqual({
      body: { project: 'p1', title: 'Faster builds' },
    });
    expect(
      createIdeaParams('p1', { title: 'A', description: ' Why. ', enabledBy: ' i1 ' }),
    ).toEqual({ body: { project: 'p1', title: 'A', description: 'Why.', enabledBy: 'i1' } });
  });

  it('edits as a merge patch sent as plain JSON, a null clearing a field', () => {
    expect(patchIdeaParams('i1', { title: 'T', enabledBy: null })).toEqual({
      path: { id: 'i1' },
      body: { title: 'T', enabledBy: null },
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('archives with the reason trimmed, and ranks by an anchor', () => {
    expect(archiveIdeaParams('i1', ' Folded into the cache epic. ')).toEqual({
      path: { id: 'i1' },
      body: { reason: 'Folded into the cache epic.' },
    });
    expect(reprioritizeIdeaParams('b', { above: 'c' })).toEqual({
      path: { id: 'b' },
      body: { above: 'c' },
    });
  });

  it('writes a drop’s priorities into the list and orders it again (qits-1791)', () => {
    const idea = (id: string, priority: number | null) => ({ id, priority });
    const ideas = [idea('c', 3), idea('a', null), idea('b', null)];
    const ranked = withPriorities(ideas, {
      items: [
        { id: 'b', priority: 4 },
        { id: 'c', priority: 3 },
      ],
    });
    expect(ranked.map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
    expect(ranked[0]?.priority).toBe(4);
    expect(withPriorities(ideas, { items: [] })).toEqual(ideas);
  });

  it('says why a write was refused: the service’s words, else the status, else unreachable', () => {
    expect(ideaRefusal({ message: 'title is blank' }, 400)).toBe('title is blank');
    expect(ideaRefusal(undefined, 404)).toBe('The service refused it (HTTP 404).');
    expect(ideaRefusal(undefined, undefined)).toBe('The service is unreachable.');
    const operation = { provider: 'p', operationId: 'o', method: 'POST' } as const;
    expect(ideaRunRefusal(new QitsApiError(400, { message: 'no' }, operation))).toBe('no');
    expect(ideaRunRefusal(new TypeError('Failed to fetch'))).toBe('The service is unreachable.');
  });
});
