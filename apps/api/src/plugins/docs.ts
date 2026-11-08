import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/**
 * OpenAPI 3.1, generated from the routes' Zod schemas, plus Swagger UI at /docs.
 * app.ts only calls this outside production, so in production the /docs routes don't exist
 * at all (404), rather than existing behind a check that could be misconfigured.
 *
 * Must run before any route is registered: @fastify/swagger collects routes as they're added.
 */
export async function registerDocs(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'IWApp API', version: '0.1.0' },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}
