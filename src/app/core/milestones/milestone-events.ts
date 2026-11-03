/**
 * qits-projects' milestone events on qits-events (epic qits-615): a milestone came to hold
 * (`MilestoneMet`: `milestoneId`, `projectId`, `displayName`, `groupId`, `satisfiedAt`) or stopped
 * holding (`MilestoneUnmet`: `milestoneId`, `projectId`, `displayName`, `at`). Both name the
 * project, so a subscriber narrows by the open project (`PayloadIds.projectId`). A rename, a new
 * milestone or an attach sends neither: those show on the next read.
 */
export const MILESTONE_EVENTS = ['MilestoneMet', 'MilestoneUnmet'] as const;
