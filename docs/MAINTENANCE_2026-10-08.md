# October 8, 2026 maintenance verification

This dated entry supersedes older maintenance reproduction instructions for this pass and preserves their historical results.

## Baseline and changes

Prepared in an independent local clone on `codex/maintenance-2026-10-08` from verified current `origin/main` at `6b2e82c1cb0d9aa20cb3223af592604b42dd4570`. The latest READY production deployment reported by read-only Vercel metadata has the same branch and commit SHA.

`.nvmrc` now selects Node 22.23.3. CI uses exact `actions/checkout@v7.0.1` and `actions/setup-node@v7.1.0` releases. The previous workflow already used v7; this change bounds each Action to its verified release.

## Reproduction and observed checks

Locally verified with the official SHA256-checked Node **22.23.3** Darwin arm64 distribution and its npm **10.9.9**. `npm ci` and `npm run check` passed. The check runs `typecheck`, `lint`, `test`, `build`, and `smoke` in order; the smoke requests the actual production build on loopback. No research, model inference, sign-in, contact submission, or database operation was performed. Coverage includes 2 regression modules (query/fallback and public safety).

Verification used a credential-free environment and no copied local `.env` files. The four app suites retain their existing guards against unmocked integration requests. Exegesis uses local fixtures, mock analytics sends, and loopback transport integration; an external verification preload blocked non-test network/socket destinations. No live database, mail, AI, or Ollama endpoint was used.

Final `npm audit --audit-level=low --json` exited 1: 9 findings (2 moderate, 7 high, 0 critical).

No override, workaround, downgrade, audit exception, audit suppression, or `npm audit fix` was applied. [Braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still has no patched version. Its reported dependent chain remains in the tree, as requested. The additional [PostCSS selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) affects the unchanged Tailwind 3 selector-parser subtree. The published patch is 7.1.6; the locked 6.x subtree needs a separate compatible dependency review.

Full logs and raw audits are retained in `/Users/danielnash/Documents/Codex/2026-10-08/task-2/evidence/`: `immunologyscout-demo-clean-install.log`, `immunologyscout-demo-audit.json`, and `immunologyscout-demo-run-check.log`.

## Limits

No push, PR, merge, deployment, settings change, or permission change occurred. Vercel read-only metadata reports project Node 24.x; those settings were preserved. Hosted Linux Actions and deployed behavior remain unverified. Existing local checkouts, their dirty files, and unpublished commits were preserved. Semantic/model quality was not evaluated; existing opt-in evaluation commands and prior quality evidence remain separate. The `lint` script aliases TypeScript checking, so it does not provide ESLint rule coverage. Clean install retains existing ESLint 10 versus legacy Next plugin peer-range warnings. Builds also report an unrelated home-directory lockfile and empty build cache.

## Verified upstream sources

- [Node 22.23.3 release](https://nodejs.org/en/blog/release/v22.23.3).
- [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0).
