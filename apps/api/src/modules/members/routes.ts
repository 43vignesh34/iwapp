import {
  MemberDetailSchema,
  MemberListQuerySchema,
  MemberListResponseSchema,
  UpdateMemberBodySchema,
} from '@iwapp/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors.ts';
import { getMember, listMembers, updateMember, type Ctx } from './service.ts';

const IdParams = z.object({ id: z.uuid() });

/** `If-Match: "7"` (or `7`). Writes must say which version they're changing (CLAUDE.md → API). */
function expectedVersion(header: string | undefined): number {
  if (!header) {
    throw new AppError(
      'precondition_required',
      'IF_MATCH_REQUIRED',
      'Send If-Match with the version you are editing.',
    );
  }
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(header.trim());
  if (!match?.[1])
    throw new AppError('invalid', 'INVALID_IF_MATCH', 'If-Match must be a version number.');
  return Number(match[1]);
}

/** HTTP only: parse, call the service, choose the status. No rules, no SQL. */
export const membersRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  const ctxOf = (request: { actor: Ctx['actor'] | null; id: string }): Ctx => {
    if (!request.actor) throw new AppError('unauthenticated', 'UNAUTHENTICATED', 'Sign in.');
    return { actor: request.actor, requestId: request.id };
  };

  app.get(
    '/members',
    {
      schema: {
        tags: ['members'],
        querystring: MemberListQuerySchema,
        response: { 200: MemberListResponseSchema },
      },
    },
    async (request) => listMembers(app.db, ctxOf(request), request.query),
  );

  app.get(
    '/members/:id',
    { schema: { tags: ['members'], params: IdParams, response: { 200: MemberDetailSchema } } },
    async (request, reply) => {
      const member = await getMember(app.db, ctxOf(request), request.params.id);
      return reply.header('etag', `"${String(member.version)}"`).send(member);
    },
  );

  app.patch(
    '/members/:id',
    {
      schema: {
        tags: ['members'],
        params: IdParams,
        headers: z.object({ 'if-match': z.string().optional() }),
        body: UpdateMemberBodySchema,
        response: { 200: MemberDetailSchema },
      },
    },
    async (request, reply) => {
      const member = await updateMember(
        app.db,
        ctxOf(request),
        request.params.id,
        expectedVersion(request.headers['if-match']),
        request.body,
      );
      return reply.header('etag', `"${String(member.version)}"`).send(member);
    },
  );

  done();
};
