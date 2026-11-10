# Deploy IWApp to staging: a step-by-step guide

You run every step yourself. Nothing here is automated until step 10, when `deploy.yml` takes over for every later merge. Each step says **what** you're creating, **why**, and **how to check** it worked.

**Time:** about 2 hours, the first time. **Cost:** ₹0 on free tiers (ADR 0004). Google Cloud still needs a card for billing, so step 2 adds a budget alert.

Throughout, keep a scratch note of the values you collect. Steps 8 and 10 need them.

| You'll create                                             | Where                           | Why                                                      |
| --------------------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Project `iwapp-staging` with billing and a budget alert   | Google Cloud                    | Holds the API, images and secrets                        |
| OAuth client (web)                                        | Google Cloud                    | Google sign-in (ADR 0003)                                |
| Project `iwapp`, branch `staging`, two roles              | Neon (Singapore)                | The database                                             |
| Artifact Registry repo `iwapp`                            | Google Cloud                    | Stores API container images                              |
| Service accounts `iwapp-api-runtime` and `iwapp-deployer` | Google Cloud                    | Least-privilege identities for running and for deploying |
| Secrets `iwapp-stg-database-url`, `iwapp-stg-jwt-secret`  | Secret Manager                  | Secrets outside the repo (spec §6)                       |
| Workload Identity pool and provider `github`              | Google Cloud                    | Lets GitHub deploy with **no stored key**                |
| Cloud Run service `iwapp-api-stg`                         | Google Cloud, `asia-southeast1` | Runs the API                                             |
| Pages project `iwapp-staging`                             | Cloudflare                      | Serves the web app and proxies `/api`                    |
| Environment `staging`, with variables and secrets         | GitHub                          | What `deploy.yml` reads                                  |

---

## 1. Install the tools

```sh
brew install --cask google-cloud-sdk   # gcloud: Google Cloud's command line
gcloud --version
gcloud auth login                      # opens a browser; sign in with the temple/tech account
```

`gh` and `pnpm` are already installed (M0 T1). You don't need to install `wrangler`, because the workflow runs it.

## 2. Google Cloud project, billing and a budget alert

```sh
export PROJECT_ID=iwapp-staging-$RANDOM   # project IDs are global; the suffix avoids clashes
export REGION=asia-southeast1             # Singapore, next to Neon (spec §8)
gcloud projects create "$PROJECT_ID" --name="IWApp staging"
gcloud config set project "$PROJECT_ID"
```

- **Billing:** open <https://console.cloud.google.com/billing>, then **Link a billing account** to the new project. You'll need a card. Free tiers still require it.
- **Budget alert (spec §8):** go to Billing → **Budgets & alerts** → Create budget. Scope it to this project, set the amount to **₹200**, and alert at 50%, 90% and 100%, by email to the admins.

Now turn on the APIs we use. A fresh project has everything off:

```sh
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
```

**Check:** `gcloud services list --enabled` lists all five.

## 3. Google sign-in: consent screen and OAuth client

1. Console → **Google Auth Platform** → **Branding**. App name **IWApp**, a support email, and the authorised domain `pages.dev` (plus your own domain later, Q4).
2. **Audience:** set it to **External**, and leave the app in **Testing** while you're on staging. Add your own Google account as a test user.
3. **Clients** → **Create client** → **Web application**, named `iwapp-staging`. Under **Authorised JavaScript origins**, add:
   - `http://localhost:5173` (local development)
   - `http://localhost`
   - `https://iwapp-staging.pages.dev` (the staging site you'll create in step 7)

   No redirect URIs are needed, because the button uses a popup.

4. Copy the **Client ID** (`…apps.googleusercontent.com`) into your note. It's **not a secret**: it also appears in the browser.

**Try it locally now (optional):**

```sh
echo "GOOGLE_CLIENT_ID=<client id>" >> .env
echo "VITE_GOOGLE_CLIENT_ID=<client id>" > apps/web/.env.local
pnpm dev   # http://localhost:5173 shows Google's button
```

Signing in with Google gets "Ask an admin to invite you" until your email is invited. Use the admin test account and `POST /api/v1/users`, or simply change `member@iwapp.test` to your own email in your **local** database.

## 4. Neon: the database

1. Sign up at <https://neon.tech> (with the temple/tech account). Create a project **`iwapp`**, choosing **Postgres 17** and the region **AWS Asia Pacific (Singapore)**. If Mumbai is offered, see spec §8 before choosing it.
2. In **Roles**, create a role **`iwapp_migrator`**. Make it the owner of a new database **`iwapp`**, and save its password in your note.
3. In **Branches**, create a branch **`staging`** from `main`. Staging uses this branch. Production uses `main`, in M4.
4. Open the **SQL editor** on the `staging` branch, database `iwapp`, connected as `iwapp_migrator`. Run this to create the API's **least-privilege** role, which can read and write rows but can't change the schema:
   ```sql
   -- Generate the password locally with: openssl rand -base64 32
   CREATE ROLE iwapp_app WITH LOGIN PASSWORD '<paste-a-generated-password>';
   GRANT CONNECT ON DATABASE iwapp TO iwapp_app;
   GRANT USAGE ON SCHEMA public TO iwapp_app;
   -- Tables the migrator creates from now on are readable and writable by the app:
   ALTER DEFAULT PRIVILEGES FOR ROLE iwapp_migrator IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iwapp_app;
   ```
5. From **Connect**, choose the `staging` branch and copy two connection strings:
   - **Migrations:** role `iwapp_migrator`, **direct**, _not_ pooled. It looks like `postgresql://iwapp_migrator:…@ep-…ap-southeast-1.aws.neon.tech/iwapp?sslmode=require`.
   - **App:** role `iwapp_app`, **pooled** (the host contains `-pooler`). Pooling lets 3 Cloud Run instances share Neon's connection limit.

**Check:** `psql "<migration url>" -c 'select version()'` prints PostgreSQL 17. You can also run it in Neon's SQL editor.

## 5. Images, identities, secrets, and a placeholder API

```sh
# Where API images are stored. The repo is called "iwapp"; deploy.yml pushes iwapp/api:<sha>.
gcloud artifacts repositories create iwapp --repository-format=docker --location="$REGION"

# The identity the API RUNS as. It can read its own secrets and nothing else.
gcloud iam service-accounts create iwapp-api-runtime --display-name="IWApp API (runtime)"
export RUNTIME_SA="iwapp-api-runtime@$PROJECT_ID.iam.gserviceaccount.com"

# Secrets. printf '%s' (not echo) matters: echo's trailing newline would end up inside the secret.
printf '%s' '<app pooled url from step 4>' | gcloud secrets create iwapp-stg-database-url --data-file=-
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" \
  | gcloud secrets create iwapp-stg-jwt-secret --data-file=-
for s in iwapp-stg-database-url iwapp-stg-jwt-secret; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done
```

**Deploy a placeholder** (Google's "hello" container), so the Cloud Run URL exists now. The Pages proxy in step 7 needs it, and the first real deploy replaces it:

```sh
gcloud run deploy iwapp-api-stg --image=us-docker.pkg.dev/cloudrun/container/hello \
  --region="$REGION" --allow-unauthenticated --service-account="$RUNTIME_SA"
gcloud run services describe iwapp-api-stg --region="$REGION" --format='value(status.url)'
```

Copy the URL (`https://iwapp-api-stg-….run.app`) into your note as **API_ORIGIN**.

**Check:** opening that URL in a browser shows Google's "It's running!" page.

## 6. Workload Identity Federation (deploys with no keys)

**What this is:** GitHub Actions can prove "I am a workflow run in `43vignesh34/iwapp`" with a short-lived signed token (OIDC). We tell Google to trust such tokens, **only from this repository**, and to let them act as a deployer service account. No JSON key file ever exists, so none can leak.

```sh
export REPO=43vignesh34/iwapp
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

# A pool of outside identities, and GitHub as a provider in it. The attribute-condition is the
# lock: tokens from any other repository are rejected outright.
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO'"

# The identity deploys run as: push images, deploy Cloud Run, and run as the runtime account.
gcloud iam service-accounts create iwapp-deployer --display-name="IWApp deployer (GitHub Actions)"
export DEPLOYER_SA="iwapp-deployer@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER_SA" --role=roles/run.admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER_SA" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOYER_SA" --role=roles/iam.serviceAccountUser

# Allow workflows from THIS repo (via the pool) to act as the deployer.
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

echo "WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
echo "WIF_SERVICE_ACCOUNT=$DEPLOYER_SA"
```

Copy both printed values into your note.

## 7. Cloudflare Pages: the web app and the `/api` proxy

1. Sign up at <https://dash.cloudflare.com>. Go to **Workers & Pages** → **Create** → **Pages** → **Upload assets** ("Direct Upload"; GitHub Actions uploads later). Name the project **`iwapp-staging`**, and upload any small folder once to create it. Your site is then `https://iwapp-staging.pages.dev`.
2. In the project → **Settings** → **Variables and Secrets**, add **`API_ORIGIN`** = the Cloud Run URL from step 5, for **Production**. The proxy in `apps/web/functions/api/[[path]].js` reads it.
3. **API token:** go to My Profile → **API Tokens** → Create token → **Custom**. Grant the permission _Account → Cloudflare Pages → Edit_, for your account only. Copy the token: it's a **secret**.
4. Copy your **Account ID** (on the Workers & Pages overview, right-hand side) into your note.

## 8. GitHub: the `staging` environment

```sh
gh api -X PUT repos/43vignesh34/iwapp/environments/staging   # creates the environment

# Variables (not secret):
gh variable set GCP_PROJECT_ID        --env staging --body "$PROJECT_ID"
gh variable set GCP_REGION            --env staging --body "$REGION"
gh variable set WIF_PROVIDER          --env staging --body "<from step 6>"
gh variable set WIF_SERVICE_ACCOUNT   --env staging --body "<from step 6>"
gh variable set GOOGLE_CLIENT_ID      --env staging --body "<from step 3>"
gh variable set CLOUDFLARE_ACCOUNT_ID --env staging --body "<from step 7>"
gh variable set CF_PAGES_PROJECT      --env staging --body "iwapp-staging"
gh variable set STAGING_URL           --env staging --body "https://iwapp-staging.pages.dev"

# Secrets (typed in at the prompt, never on the command line, so they stay out of shell history):
gh secret set STAGING_MIGRATION_DATABASE_URL --env staging   # the iwapp_migrator DIRECT url
gh secret set CLOUDFLARE_API_TOKEN           --env staging
```

**Check:** `gh variable list --env staging` shows 8 variables, and `gh secret list --env staging` shows 2 secrets.

## 9. (Optional) Grafana Cloud telemetry

Skip this to start with. Without it, staging logs still go to Cloud Logging, through stdout.

1. Create a free stack at <https://grafana.com>. Go to **Connections** → **OpenTelemetry (OTLP)**, and copy the **OTLP endpoint** and the **`Authorization=Basic …`** header value.
2. Store the header value as a secret, then set the endpoint variable:
   ```sh
   printf '%s' 'Authorization=Basic <…>' | gcloud secrets create iwapp-stg-otlp-headers --data-file=-
   gcloud secrets add-iam-policy-binding iwapp-stg-otlp-headers \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
   gh variable set GRAFANA_OTLP_ENDPOINT --env staging --body "<otlp endpoint>"
   ```

## 10. First deploy

```sh
gh workflow run deploy.yml --ref main
gh run watch   # pick the Deploy run
```

The workflow builds and pushes the image, migrates the `staging` branch, deploys Cloud Run, builds and uploads the web app, and runs the smoke test. It ends with "Staging is up…".

**Then, once only, in Neon's SQL editor** (staging branch, as `iwapp_migrator`). The tables exist now, so you can finish the least-privilege setup: the app may **add** audit rows, but never change or delete them. This adds to the trigger from ADR 0009:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM iwapp_app;
```

**Seed staging with the medium synthetic data set** (spec §11). Use the _migration_ URL. The seed refuses remote hosts unless you pass `--allow-remote`:

```sh
DATABASE_URL='<iwapp_migrator direct url>' pnpm seed --size=medium --allow-remote
```

**Invite yourself:** the test sign-in doesn't exist on staging, because staging runs with `NODE_ENV=production`. Insert your own login in the SQL editor, as the first admin:

```sql
-- Pick any seeded person to stand in for you, or insert yourself into person first.
INSERT INTO app_user (id, person_id, email, is_admin, status)
SELECT gen_random_uuid(), id, '<your google email, lowercase>', true, 'invited'
FROM person WHERE id NOT IN (SELECT person_id FROM app_user) LIMIT 1;
```

Open `https://iwapp-staging.pages.dev`, choose **Sign in with Google**, and you're the admin. From then on, invite others through `POST /api/v1/users`. (The Users screen arrives in M1.)

## 11. When something goes wrong

| Symptom                                                   | Likely cause                                                          | Check                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Deploy job **skipped**                                    | `GCP_PROJECT_ID` isn't set in the `staging` environment               | `gh variable list --env staging`                                                           |
| `auth` step: _permission denied_ or _unauthorized_client_ | WIF condition, or the workloadIdentityUser binding                    | Step 6. The repo name in both places must be exactly `43vignesh34/iwapp`                   |
| Migrate step can't connect                                | The secret holds the pooled URL, or is missing `sslmode=require`      | Step 4: migrations need the **direct** URL                                                 |
| Cloud Run revision fails to start                         | A missing env var or secret. The API refuses to boot and logs why     | Console → Cloud Run → `iwapp-api-stg` → **Logs**. Look for "Invalid environment variables" |
| Site loads, but `/api/…` returns 502                      | `API_ORIGIN` is not set in Pages                                      | Step 7.2, then redeploy                                                                    |
| Google button: _origin not allowed_                       | The staging URL is missing from the OAuth client's JavaScript origins | Step 3.3                                                                                   |

**Rollback** (spec §11): `gcloud run services update-traffic iwapp-api-stg --region "$REGION" --to-revisions=<previous-revision>=100`. On Cloudflare, go to Pages → Deployments → the previous one → **Rollback**.

## Known limits (for M4 hardening)

- **Rate limiting by IP is best-effort.** `TRUST_PROXY_HOPS=2` trusts Cloudflare's hop and Google's front end. Someone who calls the `run.app` URL **directly**, skipping Cloudflare, can put a fake IP in `X-Forwarded-For`. Planned fix: the proxy adds a shared-secret header, and the API rejects requests without it.
- **The API image is about 500 MB,** mostly Node itself and OpenTelemetry's instrumentation bundle. A slimmer base image and a narrower instrumentation set come in M4.
- **Infrastructure is hand-made from this guide.** M4 codifies it in OpenTofu (`infra/`, ADR 0006).
