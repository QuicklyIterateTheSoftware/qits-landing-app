import type { HttpTestingController } from '@angular/common/http/testing';

/**
 * Where the answers to `WorkStore.load`'s campaign reads come from (qits-projects' `/work` doors,
 * by the campaign's qualified id): each campaign's members (`listWorkMembers`) and its description
 * (`getWork`).
 */
export interface CampaignReads {
  /**
   * The state whose `listWorkMembers` answers a campaign's members read: one state for every
   * campaign, or one per campaign by its qualified id (a state records one answer per operation, so
   * a second campaign is recorded as a state of its own over the same seed, with the same frozen
   * ids).
   */
  readonly members: string | Readonly<Record<string, string>>;
  /**
   * States whose `getWork` records a campaign. A description read is answered with the one that
   * records that campaign; any other with 404 (an error answer is a status only), which leaves the
   * description out. Few states record a campaign's `getWork`: "a campaign in detail" (whose seed
   * the other "… in detail" states share) and "a campaign with a done, a verified and an
   * implementing epic".
   */
  readonly described?: readonly string[];
}

/** A recorded body: `goldenMaster` of the plain specs, or of the browser specs (a promise). */
type Read = (state: string, operationId: string) => unknown;

const MEMBERS = /^\/projects\/api\/work\/([^/]+)\/members$/;
const ITEM = /^\/projects\/api\/work\/([^/]+)$/;

/**
 * Answers every campaign read `WorkStore.load` made for the campaigns `qualifiedIds` (the
 * CAMPAIGN entries of the work it was answered), as `reads` says. A description read shares its
 * URL with the work item page's own read of that campaign: both are answered here, with the same
 * recording.
 */
export async function answerCampaignReads(
  http: HttpTestingController,
  read: Read,
  qualifiedIds: readonly string[],
  reads: CampaignReads,
): Promise<void> {
  const campaigns = new Set(qualifiedIds);
  for (const request of http.match(
    (r) => r.method === 'GET' && campaigns.has(MEMBERS.exec(r.url)?.[1] ?? ''),
  )) {
    const qualifiedId = MEMBERS.exec(request.request.url)![1];
    const state = typeof reads.members === 'string' ? reads.members : reads.members[qualifiedId];
    if (!state) throw new Error(`no state answers the members of campaign ${qualifiedId}`);
    request.flush((await read(state, 'listWorkMembers')) as object);
  }
  const described = await Promise.all(
    (reads.described ?? []).map(
      async (state) => (await read(state, 'getWork')) as { archetype: string; qualifiedId: string },
    ),
  );
  for (const request of http.match(
    (r) => r.method === 'GET' && campaigns.has(ITEM.exec(r.url)?.[1] ?? ''),
  )) {
    const qualifiedId = ITEM.exec(request.request.url)![1];
    const body = described.find((b) => b.archetype === 'CAMPAIGN' && b.qualifiedId === qualifiedId);
    if (body) request.flush(body);
    else request.flush(null, { status: 404, statusText: 'Not Found' });
  }
}

/** The qualified ids of the campaigns in a `listProjectWork` answer. */
export function campaignsIn(work: {
  readonly entities?: readonly { readonly archetype?: string; readonly qualifiedId?: string }[];
}): string[] {
  return (work.entities ?? []).flatMap((e) =>
    e.archetype === 'CAMPAIGN' && e.qualifiedId ? [e.qualifiedId] : [],
  );
}
