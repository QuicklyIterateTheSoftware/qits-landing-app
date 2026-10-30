/**
 * qits-projects' idea events on qits-events (epic qits-888): an idea created, edited (title,
 * description, enabledBy, or its derived status moved by the work naming it), archived and
 * unarchived. Each payload names `ideaId` and `projectId`, so a subscriber narrows by the open
 * project (`PayloadIds.projectId`).
 */
export const IDEA_EVENTS = [
  'IdeaCreated',
  'IdeaUpdated',
  'IdeaArchived',
  'IdeaUnarchived',
] as const;

/** An idea's derived status: no counted work names it, some does, or all of it is DONE. */
export const IDEA_STATUSES = ['PLANNED', 'QUEUED', 'DONE'] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
