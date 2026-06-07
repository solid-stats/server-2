
## 16-03 Deferred Lint Issues (pre-existing, out of scope)

Files from Plan 16-01 have 31 lint errors not introduced by Plan 16-03:
- `src/modules/public-stats/routes/history-gaps.ts` — abbreviations (prevTo, i, w), curly, array-type, no-null, no-magic-numbers, no-plusplus
- `src/modules/public-stats/routes/history-gaps.test.ts` — id-length (w), no-magic-numbers (-1)
- `src/modules/public-stats/routes/provenance.ts` — ReadonlyArray, id-length (v, d), curly, no-null
- `src/modules/public-stats/routes/provenance.test.ts` — id-length (d)
- `src/modules/public-stats/routes/slug.ts` — ReadonlyArray, id-length (s), prefer-string-replace-all
- `src/modules/public-stats/routes/slug.test.ts` — unused eslint-disable

These should be addressed in Plan 16-01 follow-up or a dedicated lint-fix plan before Phase 19 freeze.
