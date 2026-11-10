# Find a request in local Grafana

Grafana runs in the `lgtm` container: http://localhost:3000, login `admin` / `admin`.
The API sends traces and logs there over OTLP (settings in `apps/api/otel.env`).

## From a log line to its trace

1. Start the stack with `pnpm dev`, then send a request: `curl -i localhost:4000/healthz`.
2. In Grafana, open **Explore** and choose the **Loki** data source.
3. Query `{service_name="iwapp-api"}` and expand a `request completed` line.
4. Copy its `trace_id`. Switch the data source to **Tempo**, choose **Search → TraceQL**, and paste the ID.
5. You'll see the HTTP span (`GET /healthz`). From T4 on, every SQL query appears as a child span.

## From a trace to its logs

In Tempo's search, run `{ resource.service.name = "iwapp-api" }`. Open a trace, and click **Logs for this span**.

## What you should never see

- A phone number, email, date of birth, notes or a token, whether in a log line or in a span attribute. Redaction (`telemetry/logger.ts`) and query scrubbing (`telemetry/request-hooks.ts`) prevent it, and tests check both.
- A real query string. Spans record `url.query = [REDACTED]`, and logs record only the path.

## Troubleshooting

| Symptom                                           | Check                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No data at all                                    | `docker compose ps`: is `lgtm` healthy? Did the API start through `pnpm dev`? That's what loads `otel.env` and the instrumentation. |
| Trace ID found in a log, but search finds nothing | Tempo's search index lags a few seconds behind ingestion. Look the trace up by its ID instead.                                      |
| Spans named just `GET`                            | The request didn't match a route (404), so it has no route pattern to use as a name.                                                |
