import { belongsToProject, eventGist, eventTone, renderPayload } from './project-event';

const PROJECT = '00000000-0000-4000-8000-000000000001';

describe('belongsToProject', () => {
  it('holds when the payload names the project, itself or in one of its entities', () => {
    expect(belongsToProject({ payload: JSON.stringify({ projectId: PROJECT }) }, PROJECT)).toBe(
      true,
    );
    const entities = JSON.stringify({ entities: [{ projectId: PROJECT }] });
    expect(belongsToProject({ payload: entities }, PROJECT)).toBe(true);
  });

  it('fails for another project, no project, no payload or no project id yet', () => {
    expect(belongsToProject({ payload: '{"projectId":"other"}' }, PROJECT)).toBe(false);
    expect(belongsToProject({ payload: '{}' }, PROJECT)).toBe(false);
    expect(belongsToProject({}, PROJECT)).toBe(false);
    expect(belongsToProject({ payload: JSON.stringify({ projectId: PROJECT }) }, undefined)).toBe(
      false,
    );
  });
});

describe('renderPayload', () => {
  it('pretty-prints JSON with every object’s keys sorted, arrays and nulls kept', () => {
    expect(renderPayload('{"b":1,"a":{"d":null,"c":[3,1]}}')).toEqual({
      kind: 'json',
      text: '{\n  "a": {\n    "c": [\n      3,\n      1\n    ],\n    "d": null\n  },\n  "b": 1\n}',
    });
  });

  it('keeps a payload that is not JSON as it arrived, and has none for an empty one', () => {
    expect(renderPayload('typed by hand')).toEqual({ kind: 'raw', text: 'typed by hand' });
    expect(renderPayload('  ')).toEqual({ kind: 'none' });
    expect(renderPayload(undefined)).toEqual({ kind: 'none' });
  });
});

describe('eventGist', () => {
  it('reads the three known names their own way', () => {
    const payload = (p: object) => JSON.stringify(p);
    expect(
      eventGist({
        name: 'BuildSuccessful',
        payload: payload({ repoName: 'qits-ci-service', branch: 'main', commitSha: '0123456789' }),
      }),
    ).toEqual({ repository: 'qits-ci-service', summary: 'main · 0123456' });
    expect(
      eventGist({
        name: 'SCMRelease',
        payload: payload({
          repository: '208793c7-a3f6-4b8a-977f-7ac953fc1871',
          repositoryName: 'qits-ci',
          version: '2026.1.1',
          branch: 'main',
        }),
      }),
    ).toEqual({ repository: 'qits-ci', summary: '2026.1.1 · main' });
    expect(
      eventGist({
        name: 'SoftwareRelease',
        payload: payload({
          repoName: 'x',
          repository: '208793c7-a3f6-4b8a-977f-7ac953fc1871',
          version: '1',
          packageType: 'npm',
          packageName: 'p',
        }),
      }),
    ).toEqual({ repository: 'x', summary: '1 · npm p' });
  });

  it('gives no repository when the only repository key holds a UUID', () => {
    const payload = JSON.stringify({
      repository: '208793c7-a3f6-4b8a-977f-7ac953fc1871',
      version: '2026.1.1',
      branch: 'main',
    });
    expect(eventGist({ name: 'SCMRelease', payload }).repository).toBeNull();
  });

  it('reads any other name’s description, else its first three pairs by key', () => {
    const payload = JSON.stringify({ repoName: 'r', z: 1, a: 'x', b: true, c: [1] });
    expect(eventGist({ name: 'BuildStatusChanged', payload, description: 'it ran' })).toEqual({
      repository: 'r',
      summary: 'it ran',
    });
    expect(eventGist({ name: 'BuildStatusChanged', payload })).toEqual({
      repository: 'r',
      summary: 'a=x · b=true · c=[1]',
    });
  });

  it('says a payload is not JSON, unless a description says more', () => {
    expect(eventGist({ name: 'X', payload: 'nope' })).toEqual({
      repository: null,
      summary: 'payload is not JSON',
    });
    expect(eventGist({ name: 'X', payload: 'nope', description: 'by hand' }).summary).toBe(
      'by hand',
    );
    expect(eventGist({ name: 'X' }).summary).toBe('—');
  });
});

describe('eventTone', () => {
  it('is info for a release, neutral otherwise', () => {
    expect(eventTone('SCMRelease')).toBe('info');
    expect(eventTone('SoftwareRelease')).toBe('info');
    expect(eventTone('BuildSuccessful')).toBe('neutral');
  });
});
