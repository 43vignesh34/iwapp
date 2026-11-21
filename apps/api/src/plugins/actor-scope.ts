import type { FastifyInstance } from 'fastify';
import { scopeUnitIds } from '../modules/hierarchy/index.ts';

/**
 * After authentication, work out the actor's leader scope ONCE per request (one recursive CTE)
 * and attach it to request.actor. The policy module can then stay pure: authorize() just
 * checks sets in memory, however many times a request calls it.
 *
 * This lives in plugins/, not in auth or policy, so that neither of those modules depends on
 * hierarchy: the wiring happens at the edge (see "avoiding a cycle" in the module notes).
 */
export function registerActorScope(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const actor = request.actor;
    if (!actor || actor.isAdmin) return; // admins are allowed everything; no scope needed
    actor.scopeUnitIds = new Set(await scopeUnitIds(app.db, actor.personId));
  });
}
