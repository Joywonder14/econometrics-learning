# Econometrics Atlas / 计量学习地图

A bilingual learning website for econometrics beginners, with 114 original knowledge cards in 23 modules, an expandable XMind-style concept map, interactive examples, recall sessions, and cross-device progress through independent sync codes.

Live site: https://econometrics-study-atlas.stx8wpytbp.chatgpt.site

## Learning design

- Formal Chinese/English topic titles; language switching retains the current topic.
- Five branches: mathematics and statistics, regression, applied methods, causal inference, empirical research.
- 96 core cards and 18 extension cards. Extensions are hidden initially in the concept map.
- Topic hierarchy expands from the central concept to fields, modules, and cards. Breadcrumbs and parent navigation preserve the map context; the canvas supports pan, zoom, and search.
- Every card includes intuition, reasoning, formula and symbols, example, assumptions/pitfalls, a self-check, notes, and textbook references.
- The coverage audit separates core explanation, introductory coverage, and textbook-only reading. Cards are not a complete substitute for textbook proofs, derivations, examples, and exercises.

## Sources

Original explanatory writing grounded in the locally supplied English Wooldridge *Introductory Econometrics*, 5th edition (2013), Chinese translation of the 6th edition (2018), and English *Mostly Harmless Econometrics* (2009). The Chinese MHE scan did not offer reliably extractable text. Editions and source sections are distinguished; pagination is not interchangeable. Textbook PDFs and extracted text are not included or published.

## Review scheduling

`public/review-engine.js` provides an interpretable scheduling heuristic, not a claim to validated FSRS or measured recall probability. It uses elapsed time, difficulty, recorded mistakes, and the current self-check. New/relearning items begin with a short check; immediate repetition does not inflate long-term stability. Sessions are capped by count or estimated time and show answers only after recall. There are no streak requirements or missed-day penalties. Existing local progress is migrated without removing notes or bookmarks.

## Sync architecture

- No OpenAI, email, or social login is required for learners.
- A new learner enables sync to generate a 256-bit random capability code. Another device enters the same code.
- The administrator code is a **runtime secret**, `ADMIN_SYNC_CODE`. Never put a real code in source files, `.openai/hosting.json`, test fixtures, URLs, logs, or GitHub.
- The server stores token hashes, not plaintext random codes. The browser retains the user's code to reconnect; anyone who has the code can access that vault. Administrator status does not grant access to others' records.
- Cloudflare D1 stores vaults, per-card fields, versions, operation IDs, and rate-limit counters. Requests authenticate only with the sync capability.
- Per-field compare-and-swap rejects concurrent edits. The client preserves both conflict drafts for explicit resolution. Memory scheduling state is one atomic field.
- Per-vault offline caches and pending queues isolate connected users. Local-mode data is merged only during new-code creation or explicit import/merge. Codes are not recoverable through email.
- Notes, bookmarks, quiz results, reading and review records sync. Language preferences remain device-local.
- Sync retries after online/focus/visibility events. An open page can continue offline; this is not a fully offline-installable PWA.

## Development

Requires Node.js >=22.13.0. Install using `npm run install:ci` (the bundled Sites execution profile may configure its install command).

```sh
npm run build
npm start -- --port 5173
```

Configure `ADMIN_SYNC_CODE` in the hosting service's runtime secret settings. For local testing only, use an ignored `.dev.vars` file with a dummy value. Apply generated SQL migrations to the local D1 database before testing sync. `npm run db:generate` creates migrations after schema changes; never perform DDL from a request handler.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_boring_sentinels.sql
```

The public entry is `public/study.html`; the root route redirects there. UI/data live in `public/`, backend route handlers in `app/api/`, schema in `db/`, migrations in `drizzle/`. `dist/` is generated. The Sites/Vinext integration handles production Worker and D1 deployment.

## Validation

```sh
node validate.mjs
node test-app.mjs
node test-sync-client.mjs
node --test tests/backend.test.mjs
npx tsc --noEmit
npm run build
```

Tests cover bilingual content schemas and references, all card renders, OLS simulation algebra, review state integration, vault isolation, version conflicts, offline retries, stale responses, identity switching, and request validation.

## GitHub and hosting

GitHub stores the source. The live version requires a Worker-compatible server and D1 database; GitHub Pages alone cannot run the synchronization backend. Do not upload runtime secrets, local progress/database files, source textbooks, or extracted PDF text. The `.openai/hosting.json` project identifier binds the existing Sites publication; changing its audience or project is a separate deployment decision.
