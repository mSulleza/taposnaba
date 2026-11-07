@AGENTS.md

# Project notes
- Read `docs/ARCHITECTURE.md` first — it is the contract for routes, data model, conventions.
- `npm run db:test` runs the SQL migrations + seed in PGlite and asserts scheduling/QA behaviour. Run it after any change under `supabase/`.
- `npm run typecheck && npm run lint && npm run build` before considering work done.
- All "today" logic is Asia/Manila (`src/lib/dates.ts`). Never use `new Date().toISOString().slice(0,10)` for dates.
- UI strings live in `src/lib/i18n/dictionary.ts` (tl + en). DB text is bilingual (`*_tl`, `*_en`).
