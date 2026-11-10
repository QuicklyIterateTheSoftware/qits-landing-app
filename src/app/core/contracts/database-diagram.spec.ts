import { asDatabaseIndex, mermaidOf, tableOf, unitOf } from './database-diagram';

/**
 * The ER diagrams' files (qits-2014), in the shape `qits database diagram` publishes them
 * (qits-projects-service's `docs/database/`): no recording of qits-artifacts holds them yet.
 */
const INDEX = {
  formatVersion: 1,
  units: [
    {
      unit: 'epics',
      file: 'epics.md',
      entities: [{ entity: 'eu.wohlben.qits.entities.entity.AuditEntry', table: 'AuditEntry' }],
    },
    {
      unit: 'projects',
      file: 'projects.md',
      entities: [{ entity: 'eu.wohlben.qits.entities.domain.Project' }],
    },
  ],
};

describe('asDatabaseIndex', () => {
  it('keeps an index, a missing table as null', () => {
    expect(asDatabaseIndex(INDEX)?.units[1]).toEqual({
      unit: 'projects',
      file: 'projects.md',
      entities: [{ entity: 'eu.wohlben.qits.entities.domain.Project', table: null }],
    });
  });

  it('refuses what is not an index', () => {
    expect(asDatabaseIndex(null)).toBeNull();
    expect(asDatabaseIndex({ units: [] })).toBeNull();
    expect(asDatabaseIndex({ formatVersion: 1, entities: [] })).toBeNull();
    expect(asDatabaseIndex({ formatVersion: 1, units: [{ unit: 'x', entities: [] }] })).toBeNull();
    expect(
      asDatabaseIndex({ formatVersion: 1, units: [{ unit: 'x', file: 'x.md', entities: [{}] }] }),
    ).toBeNull();
  });
});

describe('unitOf', () => {
  const index = asDatabaseIndex(INDEX)!;

  it('finds the unit listing the entity', () => {
    expect(unitOf(index, 'eu.wohlben.qits.entities.entity.AuditEntry')?.unit).toBe('epics');
  });

  it('is null for an entity no unit lists', () => {
    expect(unitOf(index, 'eu.wohlben.qits.entities.domain.Nothing')).toBeNull();
  });
});

describe('tableOf', () => {
  const [epics, projects] = asDatabaseIndex(INDEX)!.units;

  it('is the table the unit names for the entity', () => {
    expect(tableOf(epics, 'eu.wohlben.qits.entities.entity.AuditEntry')).toBe('AuditEntry');
  });

  it('is null when the unit names no table for it, or does not list it', () => {
    expect(tableOf(projects, 'eu.wohlben.qits.entities.domain.Project')).toBeNull();
    expect(tableOf(epics, 'eu.wohlben.qits.entities.domain.Project')).toBeNull();
  });
});

describe('mermaidOf', () => {
  it('takes the mermaid block’s body, without the fence', () => {
    const markdown = [
      '# Persistence unit `epics`',
      '',
      '```mermaid',
      'erDiagram',
      '  AuditEntry {',
      '    string id PK "not null"',
      '  }',
      '```',
      '',
      '```text',
      'other',
      '```',
    ].join('\r\n');
    expect(mermaidOf(markdown)).toBe('erDiagram\n  AuditEntry {\n    string id PK "not null"\n  }');
  });

  it('is null without a mermaid block', () => {
    expect(mermaidOf('# Persistence unit\n\n```text\nerDiagram\n```\n')).toBeNull();
    expect(mermaidOf('```mermaid\n```\n')).toBeNull();
  });
});
