import type { Capability } from '@iwapp/shared';

/**
 * The ONE place that decides who may do what (spec §6). Pure: no database, no HTTP. Callers
 * load whatever the decision needs (the actor's scope, the resource's units) and pass it in.
 *
 * Deny by default: an action is allowed only if a rule below says so. An action with no rule,
 * or a rule that doesn't match, is denied.
 */

export interface PolicyActor {
  personId: string;
  isAdmin: boolean;
  /** Units this person leads, plus everything below them (hierarchy.scopeUnitIds). */
  scopeUnitIds: ReadonlySet<string>;
}

/** A person as the policy sees them: who they are and which units they belong to. */
export interface PersonResource {
  type: 'person';
  id: string;
  unitIds: readonly string[];
}

export type Action = 'member.list' | 'member.read' | 'member.update' | 'user.list' | 'user.invite';

type Rule = (actor: PolicyActor, resource: PersonResource | undefined) => boolean;

const isSelf: Rule = (actor, resource) =>
  resource?.type === 'person' && resource.id === actor.personId;
const isLeader = (actor: PolicyActor) => actor.scopeUnitIds.size > 0;
const inScope: Rule = (actor, resource) =>
  resource?.type === 'person' && resource.unitIds.some((u) => actor.scopeUnitIds.has(u));

/**
 * Non-admin rules. Admins are allowed everything (spec §6 table, "Admin" column), checked
 * first in authorize(). Anything missing from this table is admin-only.
 */
const RULES: Partial<Record<Action, Rule>> = {
  // Leaders list members in their scope. The list query itself filters by scope.
  'member.list': (actor) => isLeader(actor),
  // Everyone sees their own profile; leaders see members in their scope.
  'member.read': (actor, resource) => isSelf(actor, resource) || inScope(actor, resource),
  // Members correct their own contact and personal fields. Leaders editing members' contact details is open
  // question Q2, so it stays denied (admin-only) until Q2 is answered.
  'member.update': (actor, resource) => isSelf(actor, resource),
  // 'user.list' and 'user.invite': no rule, so admin-only.
};

export function authorize(actor: PolicyActor, action: Action, resource?: PersonResource): boolean {
  if (actor.isAdmin) return true;
  const rule = RULES[action];
  return rule ? rule(actor, resource) : false;
}

/** What the UI may offer this actor (GET /me). Derived from the same rules, never separately. */
export function capabilitiesFor(actor: PolicyActor): Capability[] {
  const caps: Capability[] = ['profile.view'];
  if (authorize(actor, 'member.list')) caps.push('members.view');
  if (actor.isAdmin) caps.push('members.create', 'users.manage', 'audit.view');
  return caps;
}
