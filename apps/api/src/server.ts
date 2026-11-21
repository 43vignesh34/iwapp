import { buildApp } from './app.ts';
import { loadEnv, type Env } from './config/env.ts';

let env: Env;
try {
  env = loadEnv();
} catch (error) {
  // A readable message and a non-zero exit code, not a stack trace.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = await buildApp(env);

// Cloud Run sends SIGTERM before stopping an instance, and Ctrl+C sends SIGINT. Stop accepting
// new requests, let in-flight ones finish, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      },
    );
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
