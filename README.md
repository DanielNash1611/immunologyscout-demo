# Immunology Scout Demo

Portfolio-safe demo of an immunology research assistant focused on three things:

- search
- results review
- synthesis

The app is designed for public GitHub and public deployment. It retrieves literature, optionally checks public patent coverage, and assembles a compact research brief with linked citations.

## What It Shows

- Search across PubMed plus bioRxiv and medRxiv
- Structured result cards for literature and public prior-art signals
- A synthesis widget that turns retrieval into a readable brief
- Responsive UI tuned for portfolio/demo presentation

## Product Framing

This repository is intentionally scoped as a demo repository. It showcases the search-and-synthesis experience without claiming clinical validity, scientific completeness, or production deployment breadth.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- OpenAI Responses API for optional synthesis generation
- Public literature and patent APIs behind server-side routes

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Create local env vars

```bash
cp .env.example .env.local
```

3. Run the app

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Required for model-assisted synthesis:

- `OPENAI_API_KEY`

Also supported for compatibility with earlier deployments:

- `IMMUNOLOGYSCOUT_OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `SYNTHESIS_MODEL`
- `PUBMED_API_KEY`
- `PATENTSVIEW_API_KEY`

If neither OpenAI key variable is set, the demo still works with a deterministic synthesis fallback.

If `PATENTSVIEW_API_KEY` is omitted, the app degrades gracefully and reports that patent coverage is unavailable.

## Verification

```bash
npm run typecheck
npm run test
npm run scan:public-safety
```

`scan:public-safety` fails if banned public-repo strings or paths appear again.

## Deployment Notes

Deploy this repo as its own standalone Vercel project.

- Framework preset: Next.js
- Build command: `npm run build`
- Production domain: `immunologyscout.musicofdanielnash.com`
- Site metadata lives in `lib/site.ts`

Recommended Vercel env vars:

- `OPENAI_API_KEY`
- `IMMUNOLOGYSCOUT_OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SYNTHESIS_MODEL`
- `PUBMED_API_KEY`
- `PATENTSVIEW_API_KEY`

The public deployment should not share private-product env vars, persistence layers, or internal workflows.

## Structure

- `app/` UI and API routes
- `lib/scout/` public demo orchestration
- `lib/tools/` literature and patent retrieval helpers
- `lib/site.ts` metadata and domain config
- `tests/` focused verification and public-safety checks

## License

No license is included by default. Add one explicitly if you want to permit reuse.
