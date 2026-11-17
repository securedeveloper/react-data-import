# Releasing

**Pull request → merge to `main` → publish to npm.** Merging is the approval. A release is just a pull request that changes the package version. When it merges, `.github/workflows/release.yml` publishes that version to npm with trusted publishing (OIDC, no npm token, provenance attached automatically). Then it creates the `v<version>` tag and a GitHub Release.

The published package is `packages/react-data-import` (`react-data-import`). The repository root is a private npm workspace with the package and `apps/playground`.

## 1. Add a changeset to your pull request

Every pull request that changes the published package adds a changeset:

```sh
npx changeset
```

Choose the bump (patch, minor, major) and write one line for the changelog. This creates a small Markdown file in `.changeset/`; commit it with your change. Pull requests that only touch docs or CI need no changeset.

Merging a pull request with only a changeset publishes nothing. The version doesn't change until a release pull request.

## 2. Cut a release pull request

When a release makes sense (Afzal or the team lead decides):

```sh
git switch -c release-<version> origin/main
npm run version-packages     # changeset version + version constant + lockfile sync
git diff                     # review the version bump and CHANGELOG.md
```

`npm run version-packages` runs `changeset version`, which:
- consumes the pending changesets,
- bumps `packages/react-data-import/package.json`,
- writes `packages/react-data-import/CHANGELOG.md`,
- updates the playground's exact dependency on the package.

It then runs `scripts/reset-pre-counter.mjs`, which restarts the prerelease number at 0 when the prerelease tag changed (see [§3](#3-prereleases-pre-mode)), and `scripts/sync-version.mjs`, which sets the `version` constant in `packages/react-data-import/src/index.ts` to the new version (`changeset version` never edits source files). It fails if it can't find exactly one such constant, so renaming the constant can't silently break the sync. Last, `npm install --package-lock-only` puts the new version into `package-lock.json` too.

Open the pull request. Its **Release dry run** CI job shows what merging would do. The "Release preview" step says which version would be published, or "no release". The job also runs `npm publish --dry-run` with the dist-tag that would be used.

## 3. Prereleases (pre mode)

1.0 ships as prereleases on the `next` dist-tag, so `npm install react-data-import` keeps getting `latest` (the `0.0.1` name placeholder) until 1.0.0 is final.

Pre mode is Changesets 3's own format. `.changeset/pre.json` holds just `{ "mode": "pre", "tag": "<tag>" }`. `changeset version` moves the changesets it consumed into `.changeset/pre/`, where later prereleases skip them and the final release picks them all up again. Don't edit or delete the files in `.changeset/pre/` by hand.

Any version with a prerelease part (`-alpha.1`, `-beta.0`, ...) is published with `--tag next` and marked as a prerelease on GitHub. A plain version (`1.0.0`) goes to `latest`.

### Entering pre mode

```sh
npx changeset pre enter alpha     # writes .changeset/pre.json; commit it
npm run version-packages          # 1.0.0-alpha.0, then alpha.1, alpha.2, ...
```

### Switching the tag (alpha → beta → rc)

`changeset pre enter` refuses to run while in pre mode, so a tag switch is a one-line edit:

1. On a branch, change `"tag"` in `.changeset/pre.json` (for example `"alpha"` → `"beta"`). Change nothing else, and don't bump the version. Open a pull request with that change. Merging it publishes nothing, because the version doesn't change.
2. Cut the next release pull request as usual (§2), with at least one pending changeset.

Changesets numbers the next prerelease from the current version (`prerelease[1] + 1`) and keeps counting across a tag switch: on its own, `changeset version` turns `1.0.0-alpha.2` into `1.0.0-beta.3`. `npm run version-packages` therefore runs `scripts/reset-pre-counter.mjs` right after it. The script compares the package version with the one committed at `HEAD`. When the prerelease tag differs, it rewrites the new version to `-<tag>.0` in every changed `package.json` (the package itself and the playground's exact pin) and in the `CHANGELOG.md` heading. The `version` sync and the lockfile update then use that version. So the release after `1.0.0-alpha.2` is `1.0.0-beta.0`, and the ones after it are `beta.1`, `beta.2`, .... A release with the same tag, a first prerelease and a final version are left alone. The script is shared unchanged with javascript-excel and the other family repositories: change it in all of them or not at all.

Checked with a dry run: on top of the switch to `"beta"`, with the pending changeset, `npm run version-packages` gives `1.0.0-beta.0` in `packages/react-data-import/package.json`, `CHANGELOG.md` (`## 1.0.0-beta.0`), the `version` constant, `apps/playground/package.json` and `package-lock.json`. With one more changeset, the next run gives `1.0.0-beta.1`.

### Exiting pre mode (the final 1.0.0)

```sh
git switch -c release-1.0.0 origin/main
npx changeset pre exit            # sets "mode": "exit" in .changeset/pre.json
npm run version-packages          # 1.0.0
```

With `"mode": "exit"`, `changeset version`:

- versions the package to the plain `1.0.0` (the reset script leaves final versions alone),
- writes one `## 1.0.0` CHANGELOG section with **every** changeset since pre mode was entered: those in `.changeset/pre/` and the new ones,
- deletes `.changeset/pre.json` and all of `.changeset/pre/`.

Dry run (from `1.0.0-beta.0`): `1.0.0` in the package, the playground pin, the `version` constant and the lockfile; `pre.json` and the six files in `.changeset/pre/` deleted; and every changeset since pre mode was entered in one `## 1.0.0` section.

Before merging the stable release pull request, add a short hand-written summary at the top of the `## 1.0.0` section. The release notes are that section. Merging that pull request publishes `1.0.0` to `latest`. The prerelease versions stay on npm under `next`.

## 4. What happens on merge

On every push to `main`, the `Release` job (environment `npm`, `main` only) runs `scripts/release-check.mjs`. It publishes only if **both** hold:

1. the package version differs from the previous commit (`HEAD~1`), and
2. `react-data-import@<version>` is not on npm yet.

Otherwise it stops with "no release" in the job summary. That covers docs and feature merges, re-runs after a successful publish, and the current `0.0.1` (already on npm, and the version hasn't changed).

For a release, the job then:
1. runs `npm ci`, sets up openpyxl (part of the shared `release.yml`; this package's tests don't need it, but the step is kept so the file stays identical across the four repositories), then `npm run typecheck`, `npm test` and `npm run build` (each only if the script exists),
2. runs `npm publish ./. --tag next|latest`,
3. runs `gh release create v<version>`, which creates the tag on the merge commit. The notes are that version's section of `CHANGELOG.md`.

The job also checks that npm is at least 11.5.1, which trusted publishing requires. Node 26 ships a newer npm (11.x).

Re-running the job is safe:
- After a failed publish, the version is still unpublished, so the re-run publishes.
- After a successful publish but a failed tag/Release step, the re-run skips publishing and creates the missing tag and Release.
- Moving the package is not a release. When its `package.json` is new at its path (for example, moved from the repository root to `packages/<name>`) and that version is already on npm, nothing is published and no tag or GitHub Release is created.
- If everything already succeeded, the re-run does nothing.

### Recovery: run the release by hand

A re-run repeats the original push, so it can't help when the version is no longer "new" relative to `HEAD~1`. For example, the release job failed before publishing, and a fix for the job itself was merged afterwards. For that case, `release.yml` can also be started manually:

```sh
gh workflow run release.yml --ref main
```

(or Actions → Release → Run workflow, branch `main`.)

A manual run publishes the current version of `main` **if it is not on npm yet**, even when it did not change in the last commit. It also requires that version to have a `## <version>` section in the package `CHANGELOG.md`, that is, a version cut by `npm run version-packages`. Without one, the run fails with "manual run refused: CHANGELOG.md has no \"## <version>\" section …" and publishes and tags nothing, so a scaffold or hand-edited version can't be published by hand. If it is already on npm, nothing is published, and the run only creates the `v<version>` tag and GitHub Release if they are missing. npm errors other than "not found" still fail the job, as on a push. The run is limited to `main`, both by the job's `if` and by the `npm` environment's branch policy.

Trusted publishing checks the **workflow file name** (`release.yml`) and the environment (`npm`), not the event that started it. A manual run is the same file in the same environment, so it publishes exactly like a push. The tag and Release point at the commit that was built: the tip of `main` when the run started.

## 5. First release: one-time setup (Afzal)

Trusted publishing is configured on npmjs.com, not in this repository. **Do it on the same day as the first release merge**, because npm expires a trusted publisher config that goes unused for 2 days, and it doesn't validate the fields when you save.

1. npmjs.com → `react-data-import` → Settings → **Trusted publishing** → GitHub Actions:
   - Organization or user: `securedeveloper`
   - Repository: `react-data-import`
   - Workflow filename: `release.yml`
   - Environment: `npm`
2. Merge the release pull request and check that the `Release` job published.
3. Then, under package Settings → Publishing access, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working; tokens stop working.

The `npm` GitHub environment already exists and is limited to `main`. Error `ENEEDAUTH` or `E403` on publish usually means one of the four fields doesn't match exactly (it's case-sensitive).
