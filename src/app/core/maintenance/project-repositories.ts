import type { MaintenanceRepository } from './maintenance.consumes';

/**
 * The names of the repositories of `projectId`, from the inventory's repositories
 * (`MAINTENANCE_REPOSITORIES`): the maintenance doors take no project, so each page of the
 * Maintenance section keeps the rows of these (qits-2317's Dependencies, qits-2330's Artifacts).
 */
export function projectRepositories(
  repositories: readonly MaintenanceRepository[],
  projectId: string | undefined,
): ReadonlySet<string> {
  if (!projectId) return new Set();
  return new Set(
    repositories
      .filter((repository) => repository.project === projectId)
      .map((repository) => repository.name ?? '')
      .filter(Boolean),
  );
}
