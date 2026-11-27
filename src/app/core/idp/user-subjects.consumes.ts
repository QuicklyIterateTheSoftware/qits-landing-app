import type { ListUserSubjectsResponses } from '../../api/idp';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-idp (qits-2725): `user-subjects.operations.ts` declares it as
 * `consumes`, so nothing else can be read, and `user-subjects.operations.pact.spec.ts` binds the
 * same list. To read another field, add it here.
 */

/** `USER_SUBJECTS`: each account's subject (the `sub` a toggles USER rule matches) and its name. */
export const LIST_USER_SUBJECTS = ['[].subject', '[].username'] as const;

/** A refusal's body (403): the idp's OAuth error. The editor reads only the status. */
export const IDP_REFUSAL = ['error'] as const;

/** The people a USER rule can name, cut to what the editor reads. */
export type UserSubjects = Consumed<ListUserSubjectsResponses[200], typeof LIST_USER_SUBJECTS>;

/** One person. */
export type UserSubject = UserSubjects[number];
