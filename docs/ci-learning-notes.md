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

**The fix:** nothing to change in the workflow.

- From now on, every push to `main` starts from a commit already on `main`, so the first new commit always has a parent and gitleaks scans normally.
- Re-running the _old_ run would fail the same way, because it's the same range starting at the root commit.
- That run scanned **0 bytes**, so the history was never actually scanned. To check it once, scan locally: `brew install gitleaks`, then `gitleaks git --redact -v .` (`--redact` hides any match in the output). If it finds something: **rotate the secret first**, then clean up the history.

**Don't drop the scanner to avoid the error.** My new `ci.yml` has no secret-scan job, so the error can't happen. But that's like taking the batteries out of a smoke alarm after one false alarm: no real alarms either. The repo is public, so I should add the secret-scan job back as its own job.

## 13. Which `ci.yml` does GitHub run?

**GitHub runs the workflow file inside the commit being pushed, not the file on my laptop.**

- The failed run (10 Nov) was for commit `1788c21` on `main`. The `ci.yml` _in that commit_ was the old one, with a `secrets:` job (gitleaks). Check with `git show 1788c21:.github/workflows/ci.yml`.
- My new `ci.yml` is only in commit `04b3d23` ("New CI") on my local `pipelines` branch. GitHub has never seen it, so it has never run.

```
main:       … ── 1788c21 (old ci.yml, has gitleaks) ← the run that failed
pipelines:          └── … ── 04b3d23 (my new ci.yml, no gitleaks) ← not run yet
```

Once `pipelines` is pushed, GitHub runs **my** `ci.yml` from that branch. After it's merged, `main` uses it too.

## 14. Pushing a branch to make CI run

My `on:` block runs CI on a push to **any** branch, so pushing the branch is all it takes.

**My mistake:** I ran `git push origin main` and got "Everything up-to-date". That pushes my **local `main`**, which had no new commits. My commit was on **`pipelines`**.

```
main:       … ── 061cf4d              ← already on GitHub, nothing new
pipelines:  … ── 061cf4d ── 04b3d23   ← my new commit, only on my laptop
```

**The right command:**

```bash
git push -u origin pipelines   # origin = my GitHub repo
gh run watch                   # follow the CI run live (or the Actions tab on GitHub)
```

- `-u` links local `pipelines` to `origin/pipelines`, so next time a plain `git push` is enough.
- **Team rule:** never commit straight to `main`. Changes reach `main` through a PR that I review and merge.
- **Tip:** CI runs the same commands I can run locally. Run them first (e.g. `pnpm format:check`) to catch failures before pushing.

## 15. Why `format:check` only reports and doesn't fix (and why formatting matters)

**What I thought:** "As long as the code runs, formatting isn't needed. And what's the point of a check that finds a mistake but doesn't fix it?"

**Why it doesn't fix:** same rule as section 9: **CI verifies, it never fixes.** A fix made by CI would live only on the VM, which gets deleted. The fix has to happen in a commit:

```bash
pnpm format                      # fixes every file locally
git commit -am "style: format"
```

Better: turn on **format on save** in VS Code (Prettier extension), so files are already formatted before I commit. CI's check catches the times someone forgot.

**Why formatting matters, even though the code runs either way.** It's for the people reading the code, not the computer:

- **Clean reviews:** without one format, an editor re-indents a whole file and the PR shows 200 changed lines instead of the real 2.
- **Fewer merge conflicts:** two people formatting differently = git conflicts on lines nobody really changed.
- **No style arguments:** the tool decides, so reviews focus on logic.

**Restaurant analogy:** the food tastes the same, but if every chef labels the jars differently, the next shift can't find anything.

## 16. Fixing formatting automatically, before the commit

**Decision (2026-11-12):** A + B together. CI's `format:check` goes back in as the final safety net.

| Option                       | How                                                        | Verdict                                                                         |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A. Format on save (VS Code)  | Shared `.vscode/settings.json` runs Prettier on every save | ✅ No new dependency, but VS Code only                                          |
| B. Pre-commit hook           | Every `git commit` formats staged files first              | ✅ Any editor or terminal. Two dev dependencies, which need approval            |
| C. CI fixes and commits back | CI runs `pnpm format` and pushes                           | ❌ Breaks "CI verifies, never fixes", needs `contents: write`, surprise commits |

### Part A: format on save

1. **`.gitignore`:** add `!.vscode/settings.json` under `.vscode/*`. `.vscode/*` hides personal editor files; a `!` line means "except this one". The settings file is shared, so the whole team gets format on save.
2. **`.vscode/settings.json`:**

   ```json
   {
     "editor.defaultFormatter": "esbenp.prettier-vscode",
     "editor.formatOnSave": true
   }
   ```

   - `defaultFormatter`: use Prettier, not VS Code's built-in formatter.
   - `formatOnSave`: format every time I save.
   - It uses the repo's Prettier rules (root `package.json` → `"prettier": "@iwapp/config/prettier"`), so the editor and CI agree.

3. **`.vscode/extensions.json`:** `{ "recommendations": ["esbenp.prettier-vscode"] }`. VS Code then asks anyone opening the repo to install the Prettier extension, which the settings need.

**Test:** add extra spaces in a `.ts` file and press Cmd+S. They should disappear.

**Checking a `.gitignore` rule:** `git check-ignore -v <path>` prints the rule that applies to that path. For `.vscode/settings.json`, it showed line 26 (`!.vscode/settings.json`), the exception, so the file is **not** ignored.

**What the two `.vscode` files do (line by line):**

- `extensions.json` → `"recommendations": ["esbenp.prettier-vscode"]`: a list of extension ids to _suggest_ for this repo. The id is publisher (`esbenp`) + name (`prettier-vscode`). VS Code doesn't install it automatically; it shows "This workspace has extension recommendations."
- `settings.json` → `"editor.defaultFormatter": "esbenp.prettier-vscode"`: _who_ formats (the Prettier extension, by the same id). `"editor.formatOnSave": true`: _when_ (every save).

```
extensions.json  →  makes sure the Prettier extension is installed
settings.json    →  tells VS Code to use it, on every save
Prettier         →  reads the repo's rules (@iwapp/config/prettier), the same rules CI checks
```

They live in the repo, not in my personal VS Code settings, so everyone who clones IWApp gets the same behaviour.

**Install the extension:** Extensions (Cmd+Shift+X) → search `@recommended` → install **Prettier – Code formatter**.

**Part A in my own words:**

- When I press **Cmd+S**, VS Code applies Prettier formatting automatically.
- The `.vscode` files live in the repo so that **every developer who clones it** gets format on save, without setting it up by hand. They only affect VS Code, not CI.
- The Prettier **rules** (`@iwapp/config/prettier`) also live in the repo, so the same rules apply everywhere: my laptop, a teammate's, and CI.
- **Tested it** by breaking the formatting in a file and saving. Prettier fixed it.

### Part B: git hooks (my notes)

- **A git hook** is a script that git runs **automatically** at a particular moment (e.g. just before a commit). [git docs: githooks](https://git-scm.com/docs/githooks)
- **We need the `pre-commit` hook.** It runs _before_ git records the commit, so the files can still be fixed. (`prepare-commit-msg` and `commit-msg` deal with the message; `post-commit` runs after, which is too late.)
- **When it fails** (exits with a non-zero status), **the commit is aborted.** So the hook can both _fix_ things and _block_ a bad commit.
- **Hooks live in `.git/hooks/`** and run **on my laptop**, because `git commit` runs on my laptop. GitHub never runs them.
- **They aren't stored on GitHub.** `git push` sends _commits_, not the `.git/` folder. A file in `.git/hooks/` never shows in `git status`, so it can never be part of a commit.
- **So a teammate who clones the repo gets no hook,** and their commits won't be formatted.

### Part B decision: build the hook ourselves, or add a dependency? (2026-11-13)

**My decision:** build it (Option 1: git's `core.hooksPath` + a committed `.githooks/pre-commit` script). No new dependencies.

**My reasoning:** a dependency has a cost, and it's harder to maintain and reverse.

**Corrections to my reasoning:**

- They'd be **dev dependencies**. They run only on developers' laptops and never ship to production, so there's no runtime memory or speed cost. The real costs are **supply-chain risk** (someone else's code running on every machine), **upkeep** (updates, breaking changes), and the **written justification** CLAUDE.md requires.
- **Reversing is often easier with a dependency:** removing a package is one command. My own script is code I must maintain, and I own all its edge cases.

**The honest trade-off:** no dependency risk ↔ I own the edge cases. Building it yourself is the cheaper choice only while the script stays small.

**Four criteria for any "build it or add a dependency" decision:**

1. **Dependency cost:** supply-chain risk, updates, justification.
2. **Edge cases:** who handles the awkward situations, me or the tool?
3. **Who maintains it:** my 10 lines, or a library used by thousands of projects?
4. **Reversibility:** how hard is it to switch later?
