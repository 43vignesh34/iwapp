import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors.ts';
import { InviteUserBodySchema, UserSchema } from './schemas.ts';
import { inviteUser, listUsers } from './service.ts';

/** /api/v1/users: admin user management. Every rule lives in the service via authorize(). */
export const usersRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  const ctxOf = (request: {
    actor: Parameters<typeof inviteUser>[1]['actor'] | null;
    id: string;
  }) => {
    if (!request.actor) throw new AppError('unauthenticated', 'UNAUTHENTICATED', 'Sign in.');
    return { actor: request.actor, requestId: request.id };
  };

  app.get(
    '/users',
    { schema: { tags: ['users'], response: { 200: z.object({ items: z.array(UserSchema) }) } } },
    async (request) => ({ items: await listUsers(app.db, ctxOf(request)) }),
  );

  app.post(
    '/users',
    {
      schema: {
        tags: ['users'],
        body: InviteUserBodySchema,
        response: { 201: UserSchema },
      },
    },
    async (request, reply) => {
      const user = await inviteUser(app.db, ctxOf(request), request.body);
      return reply.code(201).send(user);
    },
  );

  done();
};
