import {
  eventDetail,
  eventSubjects,
  matchesProjectEvents,
  MAX_FILTER_ATTRS,
  mergeEvents,
  NO_FILTER,
  parseFilterText,
  projectEventsQuery,
  UNTIL_CURSOR_ID,
} from './project-events';

/**
 * The Events page's pure half (qits-2312). The payloads are cut from qits-events' "a project with
 * recent events" recording (`SCMPublishCommit`, `EntityTransitioned`, `ReleaseRequestStateChanged`)
 * and qits-projects' `EntityCommented` record, to the fields each case reads.
 */
const PROJECT = '00000000-0000-4000-8000-000000000005';
const NOW = Date.parse('2026-01-02T00:00:00Z');

const commit = {
  id: 'e1',
  name: 'SCMPublishCommit',
  payload: JSON.stringify({ branch: 'main', projectId: PROJECT, repoName: 'qits-ci-service' }),
};
const transitioned = {
  id: 'e2',
  name: 'EntityTransitioned',
  payload: JSON.stringify({
    entities: [{ number: 42, projectId: PROJECT, status: 'REFINED', archetype: 'TICKET' }],
  }),
};
const request = {
  id: 'e3',
  name: 'ReleaseRequestStateChanged',
  payload: JSON.stringify({
    projectId: PROJECT,
    releaseRequestId: 'rr-id',
    releaseRequestQualifiedId: 'qits-ci-service-rr-12',
    repoName: 'qits-ci-service',
    state: 'READY',
  }),
};

describe('parseFilterText', () => {
  it('reads key=value tokens as attributes and the other words as free text', () => {
    expect(parseFilterText('  state=READY  failed  repoName=qits-ci build ')).toEqual({
      attrs: [
        { key: 'state', value: 'READY' },
        { key: 'repoName', value: 'qits-ci' },
      ],
      q: 'failed build',
      dropped: 0,
    });
  });

  it('keeps a value holding `=` whole, and reads `=x` and `x=` as words', () => {
    expect(parseFilterText('a=b=c =x y=')).toEqual({
      attrs: [{ key: 'a', value: 'b=c' }],
      q: '=x y=',
      dropped: 0,
    });
  });

  it('sends at most seven attributes and counts the rest', () => {
    const text = Array.from({ length: MAX_FILTER_ATTRS + 2 }, (_, i) => `k${i}=v`).join(' ');
    const read = parseFilterText(text);
    expect(read.attrs).toHaveLength(MAX_FILTER_ATTRS);
    expect(read.dropped).toBe(2);
    expect(read.q).toBeUndefined();
  });

  it('reads nothing from blank text', () => {
    expect(parseFilterText('   ')).toEqual({ attrs: [], q: undefined, dropped: 0 });
  });
});

describe('projectEventsQuery', () => {
  it('asks for the project’s newest fifty, and nothing else, with no filter', () => {
    // Exactly the query qits-events recorded in "a project with recent events".
    expect(projectEventsQuery(PROJECT, NO_FILTER, NOW)).toEqual({
      attr: [`projectid=${PROJECT}`],
      limit: '50',
      order: 'desc',
    });
  });

  it('joins the chosen names with commas', () => {
    expect(
      projectEventsQuery(PROJECT, { ...NO_FILTER, names: ['ReleaseRequestStateChanged'] }, NOW),
    ).toEqual({
      attr: [`projectid=${PROJECT}`],
      limit: '50',
      name: 'ReleaseRequestStateChanged',
      order: 'desc',
    });
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, names: ['A', 'B'] }, NOW).name).toBe('A,B');
  });

  it('turns a time preset into `since`, back from now', () => {
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, since: '1h' }, NOW).since).toBe(
      '2026-01-01T23:00:00.000Z',
    );
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, since: '24h' }, NOW).since).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, since: '7d' }, NOW).since).toBe(
      '2025-12-26T00:00:00.000Z',
    );
    expect(projectEventsQuery(PROJECT, NO_FILTER, NOW).since).toBeUndefined();
  });

  it('sends the box’s attributes after the project’s, and its words as `q`', () => {
    const query = projectEventsQuery(PROJECT, { ...NO_FILTER, text: 'state=READY qits-ci' }, NOW);
    expect(query.attr).toEqual([`projectid=${PROJECT}`, 'state=READY']);
    expect(query.q).toBe('qits-ci');
  });

  it('starts at "until" with the cursor after every id, and a next page at its cursor', () => {
    const until = '2026-01-01T12:00:00.000Z';
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, until }, NOW).cursor).toBe(
      `${until},${UNTIL_CURSOR_ID}`,
    );
    expect(projectEventsQuery(PROJECT, { ...NO_FILTER, until }, NOW, 'next').cursor).toBe('next');
    expect(projectEventsQuery(PROJECT, NO_FILTER, NOW).cursor).toBeUndefined();
  });
});

describe('matchesProjectEvents', () => {
  it('lets through an event naming the project at the top or in its entities', () => {
    expect(matchesProjectEvents(commit, PROJECT, NO_FILTER)).toBe(true);
    expect(matchesProjectEvents(transitioned, PROJECT, NO_FILTER)).toBe(true);
  });

  it('leaves out another project’s event, and one with no payload', () => {
    expect(matchesProjectEvents(commit, 'another', NO_FILTER)).toBe(false);
    expect(matchesProjectEvents({ id: 'x', name: 'X' }, PROJECT, NO_FILTER)).toBe(false);
  });

  it('keeps to the chosen names', () => {
    const names = ['ReleaseRequestStateChanged'];
    expect(matchesProjectEvents(request, PROJECT, { ...NO_FILTER, names })).toBe(true);
    expect(matchesProjectEvents(commit, PROJECT, { ...NO_FILTER, names })).toBe(false);
  });

  it('finds the free text in the payload, either case', () => {
    expect(matchesProjectEvents(commit, PROJECT, { ...NO_FILTER, text: 'QITS-CI' })).toBe(true);
    expect(matchesProjectEvents(commit, PROJECT, { ...NO_FILTER, text: 'githost' })).toBe(false);
  });

  it('needs every attribute, on the payload or an entity, key and value either case', () => {
    expect(matchesProjectEvents(request, PROJECT, { ...NO_FILTER, text: 'STATE=ready' })).toBe(
      true,
    );
    expect(
      matchesProjectEvents(request, PROJECT, {
        ...NO_FILTER,
        text: 'state=READY repoName=qits-githost-service',
      }),
    ).toBe(false);
    expect(matchesProjectEvents(transitioned, PROJECT, { ...NO_FILTER, text: 'number=42' })).toBe(
      true,
    );
    expect(matchesProjectEvents(transitioned, PROJECT, { ...NO_FILTER, text: 'number=43' })).toBe(
      false,
    );
  });
});

describe('eventSubjects', () => {
  it('names a commit’s repository and branch', () => {
    expect(eventSubjects(commit, 'qits')).toEqual([
      { kind: 'repository', label: 'qits-ci-service' },
      { kind: 'branch', label: 'main' },
    ]);
  });

  it('links a release request by its id, named by its qualified id', () => {
    expect(eventSubjects(request, 'qits')).toEqual([
      { kind: 'repository', label: 'qits-ci-service' },
      {
        kind: 'release-request',
        label: 'qits-ci-service-rr-12',
        link: { exit: 'releaseRequest', requestId: 'rr-id' },
      },
    ]);
  });

  it('links each transitioned item as <slug>-<number>', () => {
    expect(eventSubjects(transitioned, 'qits')).toEqual([
      { kind: 'work-item', label: 'qits-42', link: { exit: 'workItem', id: 'qits-42' } },
    ]);
  });

  it('links a commented item by its own number', () => {
    const commented = {
      name: 'EntityCommented',
      payload: JSON.stringify({ entityId: 'w1', number: 7, projectId: PROJECT }),
    };
    expect(eventSubjects(commented, 'qits')).toEqual([
      { kind: 'work-item', label: 'qits-7', link: { exit: 'workItem', id: 'qits-7' } },
    ]);
  });

  it('names an agent without a link, and a `repository` when there is no `repoName`', () => {
    const event = {
      name: 'AgentStarted',
      payload: JSON.stringify({ agentId: '0123456789abcdef', repository: 'qits-landing-app' }),
    };
    expect(eventSubjects(event, 'qits')).toEqual([
      { kind: 'repository', label: 'qits-landing-app' },
      { kind: 'agent', label: '01234567' },
    ]);
  });

  it('names nothing for a payload that is not JSON', () => {
    expect(eventSubjects({ name: 'X', payload: 'not json' }, 'qits')).toEqual([]);
  });
});

describe('eventDetail', () => {
  it('shows the envelope with the payload parsed', () => {
    const detail = JSON.parse(
      eventDetail({
        ...commit,
        occurredAt: '2026-01-01T00:00:00Z',
        publisher: 'p',
        environment: 'dev',
      }),
    );
    expect(detail).toEqual({
      id: 'e1',
      name: 'SCMPublishCommit',
      occurredAt: '2026-01-01T00:00:00Z',
      publisher: 'p',
      environment: 'dev',
      parentId: null,
      payload: { branch: 'main', projectId: PROJECT, repoName: 'qits-ci-service' },
    });
  });

  it('keeps a payload that is not JSON as its string', () => {
    expect(JSON.parse(eventDetail({ id: 'x', payload: 'plain' })).payload).toBe('plain');
  });
});

describe('mergeEvents', () => {
  it('puts the arrivals first and keeps each id once', () => {
    expect(mergeEvents([request, commit], [commit, transitioned]).map((e) => e.id)).toEqual([
      'e3',
      'e1',
      'e2',
    ]);
  });
});
