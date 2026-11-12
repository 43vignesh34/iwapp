# CI Learning Notes

Started 2026-11-11, while writing `.github/workflows/ci.yml`.

## 1. How the code gets onto the CI machine

The CI machine (the runner VM) starts empty. It **clones the code from the GitHub repository**, not from my laptop (localhost).

- The step that does this is `actions/checkout`. It works like `git clone`, at the exact commit that triggered the run.
- GitHub Actions is the system that _runs_ the workflow. The repository is where the code _lives_.
- So CI works even when my laptop is off. It only sees what I pushed.
- That means a file I forgot to commit breaks CI, even though it works on my machine.

## 2. CI is a gate before merge

The check (✅) means the CI pipeline ran successfully. Merging happens only after that.

1. `git push` to a feature branch (e.g. `feat/x`)
2. CI runs and the ✅ (or ❌) appears on the pull request
3. Click **Merge**
4. The code lands on `main`

The ✅ helps me decide whether to merge. A check that only appeared after the merge would be too late to protect `main`.

## 3. Semantic merge conflict: a green branch can still break main

CI on my branch alone tests my changes on the _old_ `main`. If someone merged in the meantime, the combination was never tested.

- **Nobody merged since I branched:** `main` = A, my branch = A + X. After the merge, `main` = A + X. CI already tested exactly that, so it's safe.
- **Someone merged Y meanwhile:** `main` = A + Y. After my merge, `main` = A + Y + X. CI only tested A + X, and their CI tested A + Y. **X and Y together were never tested.**

This is called a **semantic merge conflict**. Git merges the text cleanly, with no conflict markers, but the combined code is broken. Example: Y renames a function, and X adds a new call to the old name. [Martin Fowler: Semantic Conflict](https://martinfowler.com/bliki/SemanticConflict.html)

The `pull_request` trigger tests the combined result (A + Y + X), not my branch alone.

## 4. YAML gotchas I hit

- **A line starting with `- `** is a list item. At the top of the file, it breaks the `name:` / `on:` / `jobs:` structure.
- **`*` is special in YAML** (it starts an _alias_). Write `['**']` in quotes so it's plain text.
- **In GitHub branch filters,** `'*'` doesn't match `/`, so it misses `feat/x`. `'**'` matches everything.
- **Each `- ` under `steps:` is one step.** A step's `name:`, `uses:` / `run:` and `with:` all sit under the _same_ `- `.

## 5. How a step runs on the VM

- **No SSH.** GitHub's runner software is already on the VM. It runs each step itself, top to bottom.
- **`runs-on: ubuntu-latest`** is the whole of "start the remote VM".
- **`uses:`** runs a ready-made **action**, e.g. `actions/checkout@v7`.
- **`run:`** runs a **shell command**, e.g. `pnpm install`.

## 6. Installing the tools before `pnpm install`

The VM has no Node and no pnpm, so they're installed first, in this order:

1. `actions/checkout`: get the code
2. `pnpm/action-setup`: installs the pnpm version from `package.json` → `"packageManager"`
3. `actions/setup-node` with `node-version-file: .nvmrc` and `cache: pnpm`: installs the Node version from `.nvmrc`, and caches the packages between runs
4. `pnpm install`

- **Why pnpm comes before Node:** `cache: pnpm` needs pnpm to be there already to find its cache folder.
- **Why read the versions from files:** there's one source of truth. Hard-coding `node-version: 24` would drift the first time someone changes `.nvmrc`.

## 7. The lockfile (`pnpm-lock.yaml`)

The lockfile records the **exact** version of every package installed, including the dependencies of my dependencies.

- `package.json` says what I _allow_: `"fastify": "^5.0.0"` means any 5.x.
- `pnpm-lock.yaml` says what I _actually got_: e.g. `fastify 5.2.1`, plus the exact versions of everything it pulls in.
- **Why it matters:** without it, my laptop might install 5.2.1 today and CI 5.3.0 tomorrow. The code is the same, but the packages and possibly the behaviour are different.
- It's committed to git, so every machine installs identical packages.

## 8. How `pnpm install` picks versions

1. **Lockfile matches `package.json`:** it installs exactly what the lockfile says. Nothing is chosen.
2. **Lockfile missing or out of date:** it asks the npm registry for the **highest version that satisfies the range** (e.g. `^5.0.0` → newest 5.x), then writes that into the lockfile.

- **In CI, case 2 is dangerous:** CI would test packages nobody on the team has installed.
- **pnpm refuses case 2 in CI by default.** It fails with an "outdated lockfile" error. I still write the flag explicitly, so the intent is visible. ([pnpm install docs](https://pnpm.io/cli/install))
- **So the answer to "fix the lockfile or fail?" is: fail.** Then fix it locally and commit the new lockfile.

## 9. Why `pnpm install --frozen-lockfile` should fail in CI

**In my words:** if the lockfile got updated every time someone ran it on their machine, we'd never know whether _this particular_ version passed. Only the version that happened to be installed that time would have passed.

**Why that's a problem, step by step:**

1. I add a package to `package.json` but forget to run `pnpm install`, so the committed lockfile is stale.
2. If CI were allowed to fix it, CI would pick versions on its own machine, e.g. `fastify 5.3.0`.
3. CI runs the tests against 5.3.0 and goes ✅.
4. The VM is deleted. Its updated lockfile is gone, because it was **never committed**.
5. My teammates, the deploy and production all install from the stale lockfile in git, and get a _different_ set of packages.
6. So the ✅ meant "_some_ version passed", not "_this_ committed version passed". It's a false signal.

**What `--frozen-lockfile` does instead:** pnpm may not change the lockfile. If it doesn't match `package.json`, the install fails with a clear "lockfile is out of date" error.

**The fix is then done by a human, in git:**

1. Run `pnpm install` locally (this updates `pnpm-lock.yaml`).
2. Commit the updated lockfile and push.
3. Now CI, my laptop, my teammates and production all install identical packages, and the ✅ is about _exactly_ what's in git.

**Principle: CI verifies, it never fixes.** Anything inconsistent → fail loudly → a human fixes it in a commit.

## 10. Which scripts belong in the CI checks job

**Rule: CI only runs commands that verify code and change nothing.**

| In CI          | Why                                                     |
| -------------- | ------------------------------------------------------- |
| `format:check` | _Reports_ unformatted files (`format` rewrites them)    |
| `lint`         | Reports code problems                                   |
| `typecheck`    | Reports TypeScript type errors                          |
| `test`         | Runs unit tests                                         |
| `build`        | Compiles every app (`apps/web`, `apps/api`) and package |

**Not in this job:**

- `dev`: it starts a server and **never finishes**, so the step would hang until the job's time limit, then fail.
- `format`, `db:generate`: they _change_ files. CI verifies, it never fixes.
- `db:migrate`, `seed`, `dev:down`: they manage a database or Docker, not checks.
- `test:int`, `e2e`: real checks, but they need Docker, a database or a browser, so they go in their own jobs.

## 11. What each check catches

| Step         | What it checks                                                      | Example it catches                                                   |
| ------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Format check | **Style:** spacing, quotes, line length. The code works either way. | `const  x ="a"` should be `const x = 'a';`                           |
| Lint         | **Suspicious code** that runs, but is probably a mistake            | An unused variable, a forgotten `await`, use of `any`                |
| Typecheck    | **Types** match: you promised a number, is it really one?           | `const age: number = "twenty"`                                       |
| Unit tests   | **Logic:** does each small function give the right answer?          | `fullName("Ram", "Das")` returns `"Ram"` instead of `"Ram Das"`      |
| Build        | **Compiles** TypeScript into the JavaScript that actually ships     | A missing file or import that only breaks when everything is bundled |

They work like a series of filters, from cheapest to most thorough: surface style → suspicious code → types → behaviour → shippable. Each one runs locally with the same command, e.g. `pnpm lint`.

## 12. Gitleaks, and the "first push" error

**What gitleaks is:** a **secret scanner**. It reads the code _and the git history_ for things that look like passwords, API keys or tokens (e.g. `postgres://admin:S3cretPass@...`). If it finds one, CI goes red.

**Why it matters for IWApp:** the repo is public (ADR 0005). Bots scan GitHub for keys within minutes. Deleting the file later doesn't help, because the secret stays in **git history**. That's why the secret-scan job checks out with `fetch-depth: 0` (full history).

**The error we hit (2026-11-10, first push to `main`):**

```
fatal: ambiguous argument '5497a2b^..1788c21': unknown revision
scanned ~0 bytes
ERROR: Unexpected exit code [1]
```

- On a `push`, gitleaks scans only the **new** commits: from the commit _just before_ the first new one (`first^`) to the last.
- This was the **first ever push**, so the first new commit was the repo's **root commit**, which has **no parent**. `5497a2b^` doesn't exist, so git failed and gitleaks crashed before scanning.
- **It was not a leak.** A leak exits with code **2** (`--exit-code=2`), but this exited with **1** (a crash), and it scanned 0 bytes.

```
Normal push:  A ── B ── C ── D ── E      "just before D" = C ✅
                         └new─┘
First push:   (nothing) ── A ── B ── C   "just before A" = ❌ doesn't exist
```

**How it was diagnosed:**

1. `gh run list` → `gh run view <id>`: only Secret scan failed.
2. Read the gitleaks step's log: exit code 1 (not 2), `unknown revision`, 0 bytes scanned.
3. Hypothesis: the first pushed commit has no parent.
4. Checked locally: `git rev-list --max-parents=0 HEAD` → `5497a2b` (the root commit). `git rev-parse 5497a2b^` → the same error.

**Lesson:** read the exit code and the log before assuming what a red check means. A red secret scan doesn't always mean a secret leaked.
