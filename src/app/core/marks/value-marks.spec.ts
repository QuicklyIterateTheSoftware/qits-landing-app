import { valueMarks } from './value-marks';

interface Idea {
  readonly id: string;
  readonly title: string;
  readonly owner?: { readonly name: string } | null;
}

const IDEA_READ = { provider: 'qits-ideas-service', operationId: 'getIdea' };
const idea: Idea = { id: 'i1', title: 'Faster builds', owner: { name: 'ada' } };

describe('valueMarks (qits-2146)', () => {
  it('names the read, the record by its key and the field shown', () => {
    expect(valueMarks(IDEA_READ, idea, 'id', 'title')).toEqual({
      source: 'qits-ideas-service#getIdea',
      item: 'id=i1',
      field: 'title',
    });
    expect(valueMarks(IDEA_READ, idea, 'id', 'owner.name').field).toBe('owner.name');
  });

  it('names the fields a derived value is computed from, once each, in order', () => {
    expect(valueMarks('s#op', idea, 'id', { derived: ['title', 'owner', 'title'] })).toEqual({
      source: 's#op',
      item: 'id=i1',
      derived: 'title owner',
    });
  });

  it('leaves the item out for a record without its key', () => {
    expect(
      valueMarks(IDEA_READ, { ...idea, id: null as unknown as string }, 'id', 'title').item,
    ).toBeNull();
  });
});
