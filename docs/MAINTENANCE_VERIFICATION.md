# Maintenance verification — September 30, 2026

Production lineage: `main` at `cf5c570059419611b7df8175c9fc99ade1f1d006`. Prepared in an independent local clone on `maintenance/secure-baseline`; original working copies were preserved.

## Reproduction

Use Node **22.22.1** (the exact locally tested version, pinned in `.nvmrc`) and npm **10.9.4**. Run `npm ci`, then `npm run check`, then `npm audit --audit-level=low`. The check executes type checking, configured lint, offline synthetic regression tests, production build, and loopback HTTP smoke tests. CI uses the same Node pin and commands; the hosted Linux workflow has not run because this branch has not been pushed.

The check child environment drops inherited credentials/database URLs. No local environment file or production credential was copied into this clone. Unit tests reject unmocked fetch/HTTP requests; integrations must provide synthetic mocks. The `server-only` marker is replaced only inside the test process so server code and React server-rendering tests can coexist. Production modules and build behavior are unchanged by that test hook. Smoke tests start the actual built server on loopback and request the homepage; they do not perform research, inference, sign-in, submissions, or database queries.

## Audit evidence

Original lockfile install reported **15** advisories: 2 low, 3 moderate, 9 high, 1 critical. Final clean install and official npm audit reported **0**, with all severity counts zero. Zero reported advisories describes the current npm advisory coverage, not complete application security.

Workspace evidence: `/Users/danielnash/Documents/Codex/2026-09-30/task-4/demo-baseline-install.log`, `/Users/danielnash/Documents/Codex/2026-09-30/task-4/demo-final-install.log`, `/Users/danielnash/Documents/Codex/2026-09-30/task-4/demo-final-audit.json`, and `/Users/danielnash/Documents/Codex/2026-09-30/task-4/immunologyscout-demo-check.log`.

## Resolved versions

- `eslint`: `10.11.0`
- `next`: `16.3.8`
- `react`: `19.3.0`
- `react-dom`: `19.3.0`

## Sources and limits

- [Next.js September security release](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026) and [September 22 upstream security update](https://nextjs.org/blog/nextjs-security-update-september-22-2026); official npm registry confirmed published `16.3.8` before installation.
- [ESLint support schedule](https://eslint.org/version-support/): ESLint 9 reached EOL August 6, 2026; updated to ESLint 10.11.0.
- Official package metadata and security advisories came from `https://registry.npmjs.org`; no global software was installed.
- Live integration behavior, real-user data, model quality, and production deployment were not exercised. Semantic evaluations remain separate opt-in commands.

Both query/fallback and public-safety test modules pass. `lint` currently aliases TypeScript checking; no claim of ESLint rule coverage. Browser QA rendered the public workbench without launching retrieval.
