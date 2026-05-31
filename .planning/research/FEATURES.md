# Feature Research

**Domain:** Public read-API surface for a competitive-game replay-statistics website (`server-2` backend serving the `web` frontend `sg.zone`)
**Researched:** 2026-05-31
**Confidence:** HIGH (grounded in the actual `web` brief, web sketches 001–003, server-2 PROJECT.md, and V2-CUTOVER-REVIEW.md — not generic assumptions)

## Scope Note

This research covers ONLY the **new public read-API features** the `web` frontend needs from `server-2` for the v3.0 "Public API v1" milestone. It does NOT cover the already-shipped public endpoints (`/stats/overview|players|players/{id}|squads|squads/{id}|rotations|commander-sides|bounty|leaderboards`, auth, requests, moderation, admin roles, operations). Where an existing endpoint must change shape (e.g. cursor pagination, formula breakdown, provenance), that delta is treated as a v1 feature.

**OUT OF SCOPE for this milestone (flagged explicitly):**
- The **player-request correction flows** (the brief's 5 guided flows: identity, add/remove kills, add/remove teamkills, remove-player-from-replay, commander dispute; drafts API, autosave, attachments). This is the "hybrid request-model" rework tracked as a **separate milestone / `/gsd:discuss-phase`** (V2-CUTOVER-REVIEW §E; PROJECT.md "Out of this milestone"). The contract is NOT frozen for these. The web replay-detail "request entrypoint" links are a UI affordance — the backend only needs them once that separate milestone lands.
- SSE / realtime freshness (deferred past v1; static + manual refresh first — V2-CUTOVER §F).
- Annual/yearly nomination statistics; player/squad/rotation comparison views (brief "Out of Scope", v2).

Every feature below cites the specific web-brief line(s) or sketch that requires it.

---

## Feature Landscape

### Table Stakes (web brief requires these for v1; missing = web screens cannot be built)

| Feature | Why Expected (web-brief trace) | Complexity | Data Dependency (already computed?) |
|---------|--------------------------------|------------|-------------------------------------|
| **Cursor pagination + server-side sort on all list endpoints** (players, squads, replays, bounty/leaderboards) | Brief: "Public lists use cursor-based pagination with server-side filtering and sorting"; "designed for 10k-100k row datasets"; STAT-14. Replaces existing `page/pageSize`. | MEDIUM | Existing list queries; need stable sort keys + opaque cursor. Touches every existing list endpoint (contract-breaking → must land before freeze). |
| **slug→id resolution for player & squad** | Brief: "player and squad URLs are slug-only. The current slug owner is authoritative"; STAT-13. Endpoints are UUID-only today. | LOW–MEDIUM | Canonical identity + active-nickname uniqueness already exist (PROJECT.md). Need slug-addressable route or a resolve endpoint; current-owner resolution logic. |
| **Replay list** (`GET /stats/replays`) with filters (rotation / date / map) + cursor | Brief Key Screens "Replay Detail" + sketch 003 makes replay list the *default* page; "Replay list/search page." V2-CUTOVER §B. | MEDIUM | Replays exist canonically (ingest/parse pipeline shipped). Need a public read projection: map, rotation, date, side summary, kills/vehicles/TK/score per side (sketch 003: "642 kills, 39 vehicles, 11 TK, score 4 410"). |
| **Replay detail** (`GET /stats/replays/:id`) — summary + participants + sides + provenance | Brief: "replay detail pages are public and indexable"; "server-render summary and participant context first"; "map/rotation/date, participants, sides, parse/provenance state, key stats." Sketch 003 shows sides with winner + participant rows. URL is replay-ID only. | MEDIUM | Parsed/normalized replay data + aggregates shipped (v2.0 compact counters). Need to assemble summary doc: map, rotation, date, sides, per-participant kills/deaths/vehicles/score, winner state. |
| **Replay event timeline** (`GET /stats/replays/:id/events`) — paged/progressive | Brief: "Timeline/event data should load progressively"; "Desktop dense event table with filters; mobile grouped timeline." Sketch 003: events "enemy kill / infantry", "vehicle kill", "X teamkill Y". | MEDIUM–HIGH | Normalized events persisted (parser output). Need a public, paged, filterable event projection (event type, actor, victim, time, side, vehicle/weapon, bounty-relevance flag). Largest single piece (V2-CUTOVER §B). |
| **Replay-ID sitemap enumeration** | Brief: "All replay detail pages are indexable"; "Large public URL sets, especially replay pages, require segmented sitemaps through a sitemap index"; SEO-08. | LOW–MEDIUM | Replay IDs exist. Need an enumerable, paginated/segmented ID feed (cursor over all replay IDs + last-modified) for `web` to build its sitemap index. |
| **Promote parity stats to player profile** — weapons, vehicles, player-vs-player relationships, weekly buckets, KD / score / total games | Brief Player Profile: "rotation stats", "bounty-related stats", "links to relevant replays/stat details where API supports"; sketch 002 columns: games, kills, vehicle kills, vehicle-kill %, destroyed vehicles, teamkills, deaths-from-teamkills, total deaths, K/D, score. V2-CUTOVER §A. | MEDIUM | **Already computed** — lives only in the `legacy-public-export.v1` CLI / `repository/legacy-export.ts` SQL. Work = wire that SQL into public read model + TypeBox schema + OpenAPI + tests. Low aggregation risk, real surfacing work. |
| **Promote parity stats to squad profile** — same parity surfaces | Brief Squad Profile: "squad rotation stats", "squad effectiveness inputs relevant to bounty scoring." V2-CUTOVER §A. | MEDIUM | Same as above (squad-scoped legacy-export SQL). |
| **Nickname / alias history with timestamps** (public) | Brief: "Full nickname history is public"; Player Profile "Nickname history." V2-CUTOVER §C. | LOW | **Already maintained** (PROJECT.md: nickname history). Work = expose dated entries on profile. |
| **Squad-membership history (dated timeline, with unknown gaps)** on player & squad profiles | Brief: "Squad membership history should be public as a timeline with dates and unknown gaps where available"; Player "current/previous squad history"; Squad "historical membership view." V2-CUTOVER §C. | LOW–MEDIUM | **Already maintained.** Work = expose dated timeline + explicit unknown-gap representation. |
| **Bounty formula component breakdown** (victim player effectiveness + squad effectiveness + rotation context) | Brief: "Bounty points should include formula breakdown where data exists, including victim player effectiveness, squad effectiveness, and rotation context"; "Squad effectiveness should be explainable... not hidden as an opaque number"; Bounty Stats screen "Show why a kill was valuable." | MEDIUM | Bounty formula is documented + tested (PROJECT.md: "v1 formula is documented and tested"). Inputs exist (previous-rotation player/squad effectiveness). Work = attach component fields to bounty/leaderboard responses, not new math. |
| **Commander-side stats with explicit unknown outcome + filterable** | Brief: "Legacy commander-side games with unknown outcome must be shown as an explicit unknown status and be filterable"; Commander-Side screen "Wins/losses where known, Unknown outcomes for legacy data, Filters by rotation/player/side." | LOW–MEDIUM | **Already represented** as unknown (PROJECT.md: "Represent unknown legacy winners"). Existing `/stats/commander-sides`. Work = ensure unknown is a first-class filterable enum + add per-side / rotation / player filter params. |
| **Provenance / last-updated metadata on stat responses** | Brief: "show visible provenance where available: last updated state, relevant replay/source links, unknown badges, conflict badges, parse/status context"; STAT-15. Sketch 003: "Parsed", "winner detected from replay data", "Has unknowns". | LOW–MEDIUM | Parse/ingest status + timestamps exist. Work = surface `lastUpdatedAt` + source/replay links + status flags on responses (consistent envelope). |
| **Rotation-as-filter param across stat surfaces** | Brief: "rotation must also be available as a filter context across key stat surfaces"; STAT-06. Sketch 002: "keeps a rotation filter available." | LOW | Rotation filtering already exists for bounty/stats (PROJECT.md). Work = ensure consistent `rotationId` filter on players/squads/commander/replays. |
| **Rotation canonical pages / per-rotation detail endpoint** | Brief: "Rotation URLs should exist as canonical pages"; indexable rotation pages (SEO). | LOW | `/stats/rotations` exists. Work = per-rotation detail endpoint (`/stats/rotations/:id`) with rotation summary stats. |
| **Server-side SteamID masking (last-4 only)** | Brief: "SteamID may be displayed only in masked form, with only the last four digits visible"; PROJECT.md locked: "full SteamIDs must never reach web." | LOW | SteamID history exists server-side. Work = mask at API layer on player profile; never serialize full ID. **Security-critical — verify no leak path.** |
| **Frozen, stable OpenAPI contract** (bump `0.1.0`→stable, published artifact path, CI freeze gate) | Brief API Assumptions: "web must use `openapi-typescript`... fail CI when generated types are stale"; "server-2 owns the OpenAPI schema and keeps it versioned." V2-CUTOVER §G. | MEDIUM | All above land first. Work = version bump, publish artifact path, wire `test:integration` (Postgres read paths) into CI as freeze gate. **Gates web client generation.** |

### Differentiators (Trust & explainability — the product's Core Value: "filter, trust, correct")

| Feature | Value Proposition (web-brief trace) | Complexity | Notes |
|---------|-------------------------------------|------------|-------|
| **Explainable bounty breakdown** (victim effectiveness + squad effectiveness + rotation context exposed, not opaque) | This is the product's trust differentiator vs a plain leaderboard — "explain WHY a value is what it is." Brief explicitly forbids hiding squad effectiveness "as an opaque number." | MEDIUM | Listed as table stakes above for v1 *delivery*, but the *explainability depth* (per-component fields + formula-tooltip data; sketch 002 "Calculated values expose formula tooltips") is what differentiates. Ship component fields, not just a number. |
| **First-class "unknown" outcome as a queryable status** (commander winners, squad-history gaps) | Brief treats unknowns as honest first-class data, not blanks: "explicit unknown status and be filterable", "unknown gaps where available", sketch 003 "Has unknowns." Builds trust for legacy data. | LOW–MEDIUM | Differentiator = unknown is filterable/badgeable, not silently omitted. Cheap because data already models unknown. |
| **Provenance envelope** (last-updated + source/replay links + parse-status + conflict badges on every public response) | Brief STAT-15 + "Public Data Trust." Lets `web` render trust signals (stale banners, "Parsed" badge, conflict badge) per the quality bar. | LOW–MEDIUM | A consistent metadata envelope across endpoints is more valuable (and cheaper) than per-page bespoke fields. Design once. |
| **Bounty-relevance flag on replay events** | Sketch 003 marks events "vehicle kill / bounty relevant elsewhere" — lets web cross-link an event to its bounty contribution. Ties the replay timeline to the bounty story. | MEDIUM | Requires joining event → bounty award. Defer the *deep* cross-link if costly; a boolean flag is cheap and high-value. |

### Anti-Features (commonly requested for stats sites, but wrong for v1 here)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Backend request-correction endpoints in THIS milestone** (event→request, drafts, autosave, attachments) | The replay sketch shows "request entrypoint" / "moderation request candidate" links; tempting to build the API now. | The request-model rework (4 current types vs brief's 5 flows) is an unresolved hybrid design (V2-CUTOVER §E; PROJECT.md). Building/freezing it now risks a contract you must break next milestone. | **Explicitly defer to the separate request-model milestone.** Web can render dead/disabled entrypoints or gate them behind that milestone. Do NOT freeze request contract in v1. |
| **SSE / realtime freshness stream** | Brief mentions SSE heavily for web; tempting to add a backend stream. | Deferred by locked decision (V2-CUTOVER §F; PROJECT.md). Static data + `lastUpdatedAt` + manual refresh satisfies v1. Premature SSE adds reconnect/merge complexity. | Ship `lastUpdatedAt` provenance + manual/poll refresh. Add SSE post-v1. |
| **Server-side full-text / global search across the product** | Stats sites usually have a command-palette search. | Brief: "Global search... is out of scope; v1 search is scoped to the relevant public table or surface." | Per-surface server-side filter (name prefix/contains on the players/squads list). No cross-entity search endpoint. |
| **Offset/page pagination kept for compatibility** | Easier than cursors; "we already have page/pageSize." | Breaks at 10k-100k rows (brief scale target) and conflicts with the locked cursor decision; keeping both bloats the frozen contract. | Cursor-only on all list endpoints. Remove page/pageSize before freeze. |
| **Comparison endpoints** (player-vs-player, squad-vs-squad pages) | Natural stats-site feature; player-vs-player *relationship* data already exists. | Brief: "comparison is v2 / out of scope." player-vs-player *relationship* (table stakes above) is a profile sub-resource, NOT a comparison surface. | Expose pvp relationships on the profile only; no dedicated comparison endpoint. |
| **Exposing full SteamID or richer Steam profile data** | Web wants account link state. | Locked security decision: full SteamID must never reach web. PII/abuse risk. | Masked last-4 + public-safe link state only. |
| **Versioned/historical replay re-parse results** | "Show how stats changed over time." | PROJECT.md out-of-scope: v1 overwrites derived parse results (audit patches preserved). | Current snapshot + `lastUpdatedAt`. No version-history API. |
| **Yearly/nomination stat endpoints** | Legacy `!yearStatistics` exists. | Brief + PROJECT.md: deferred to a dedicated historical-statistics milestone. | None in v1. |

---

## Feature Dependencies

```
Cursor pagination + server-side sort
    └──required by──> Replay list, Players list, Squads list, Bounty/Leaderboards
                          (all list endpoints must adopt before contract freeze)

slug→id resolution
    └──required by──> Player profile route, Squad profile route (slug-only URLs)

Replay detail
    └──requires──> Replay list projection (shared read model: map/rotation/date/sides)
Replay event timeline
    └──requires──> Replay detail (events scoped to a replay)
    └──enhanced by──> Bounty-relevance flag (event → bounty award join)
Replay-ID sitemap
    └──requires──> canonical replay records (exist)

Parity stats (weapons/vehicles/pvp/weekly/KD-score-games)
    └──requires──> legacy-export.ts SQL wired into public read model + TypeBox schema

Bounty formula breakdown
    └──requires──> victim player effectiveness + squad effectiveness inputs (exist, prev rotation)
Squad-effectiveness explainability ──enhances──> Bounty breakdown AND Squad profile

Provenance envelope ──enhances──> ALL public stat responses
Rotation-as-filter ──enhances──> players / squads / commander / replays lists
Commander-side unknown status ──requires──> unknown-winner data model (exists)

OpenAPI freeze (G)
    └──requires──> ALL of the above stable (the closing gate)

[Request-correction endpoints] ──BLOCKED BY──> separate request-model milestone (NOT v1)
[SSE freshness] ──DEFERRED──> post-v1
```

### Dependency Notes

- **Everything gates the OpenAPI freeze (G):** the contract can only be frozen after A (parity), B (replays), C (history), D (ergonomics) land. Fast-unblock path (V2-CUTOVER): freeze the stable read-stats subset (A+C+D) first so web can start stats screens, then land B (replays), then full freeze.
- **Cursor pagination is contract-breaking and pervasive** — it must be decided/implemented before freeze on *every* list endpoint, including existing ones. Highest coordination cost.
- **Replay event timeline depends on replay detail** sharing a read model; build the replay read projection once and layer events on top.
- **Bounty breakdown reuses existing formula inputs** — it is a *serialization* change (attach components), not new aggregation. Same for nickname/squad history and parity stats (all "already computed", per PROJECT.md "primarily public API-surface completion, not new aggregation").
- **Request entrypoints in the replay sketch are UI-only for v1** — the backend correction contract is out of scope; do not let the sketch pull request endpoints into this milestone.

---

## MVP Definition

### Launch With (v1 — this milestone, what `web` needs to build its public screens)

- [ ] **Cursor pagination + server-side sort** on all list endpoints — web tables target 10k-100k rows; contract-breaking, must precede freeze.
- [ ] **slug→id resolution** (player + squad) — web URLs are slug-only.
- [ ] **Replay list / detail / event timeline** + replay-ID sitemap — the largest new surface; replay is web's default page (sketch 003).
- [ ] **Parity stats on player + squad profiles** (weapons, vehicles, pvp relationships, weekly, KD/score/games) — promote from CLI to public routes.
- [ ] **Nickname history + squad-membership history (dated, unknown gaps)** — public profile timelines.
- [ ] **Bounty formula component breakdown** + **squad-effectiveness explainability** — the trust differentiator; "explain WHY."
- [ ] **Commander-side stats: explicit filterable unknown + per-side/rotation/player filters.**
- [ ] **Provenance / last-updated metadata envelope** on stat responses.
- [ ] **Rotation-as-filter** across surfaces + **per-rotation detail endpoint**.
- [ ] **Server-side SteamID masking (last-4)** — security-critical.
- [ ] **Admin rotation CRUD** (brief ADMIN-02; rotations are a launch-blocking admin surface) — backend endpoints.
- [ ] **Freeze OpenAPI contract** (version bump + published artifact + CI integration freeze gate) — gates web type generation.

### Add After Validation (v1.x / next milestone)

- [ ] **Player-request correction flows** (5 guided flows, drafts API, autosave 7-day TTL, attachments, reopen) — the hybrid request-model milestone (separate `/gsd:discuss-phase`). **Explicitly out of v1.**
- [ ] **Bounty-relevance deep cross-link** on events (event → exact bounty award) — boolean flag in v1, deep link later if valued.

### Future Consideration (v2+)

- [ ] **SSE / realtime freshness stream** — deferred; static + manual refresh first.
- [ ] **Comparison endpoints** (player/squad/rotation comparison) — brief v2.
- [ ] **Yearly / nomination statistics** — dedicated historical-statistics milestone.
- [ ] **Global / command-palette search** — brief out of scope.

## Feature Prioritization Matrix

| Feature | User/Web Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Cursor pagination + server-side sort (all lists) | HIGH | MEDIUM | P1 |
| Replay list/detail/event timeline + sitemap | HIGH | HIGH | P1 |
| Parity stats on player/squad profiles | HIGH | MEDIUM | P1 |
| Bounty formula breakdown + squad-effectiveness explainability | HIGH | MEDIUM | P1 |
| Commander-side filterable unknown + filters | HIGH | LOW–MEDIUM | P1 |
| slug→id resolution | HIGH | LOW–MEDIUM | P1 |
| Nickname + squad-membership history timelines | MEDIUM–HIGH | LOW–MEDIUM | P1 |
| Provenance / last-updated envelope | MEDIUM | LOW–MEDIUM | P1 |
| SteamID masking (last-4, server-side) | HIGH (security) | LOW | P1 |
| Rotation filter + per-rotation detail endpoint | MEDIUM | LOW | P1 |
| Admin rotation CRUD | MEDIUM | MEDIUM | P1 |
| OpenAPI freeze + CI gate | HIGH | MEDIUM | P1 (closing) |
| Bounty-relevance flag on events | MEDIUM | MEDIUM | P2 |
| Request-correction endpoints | HIGH (later) | HIGH | DEFERRED (separate milestone) |
| SSE freshness | MEDIUM | HIGH | DEFERRED (post-v1) |

**Priority key:** P1 = required for v1 freeze; P2 = ship if cheap, else next; DEFERRED = explicitly out of this milestone.

## Competitor Feature Analysis

Domain note: this is an internal-community OCAP/Arma-replay stats product, not a mass-market title with direct public competitors. The relevant references are the legacy `sg_stats` site this replaces and general replay-stats-site conventions. The brief itself is the authoritative spec, so analysis is framed against legacy parity + the brief rather than external products.

| Feature | Legacy `sg_stats` (being replaced) | Brief's target | Our (`server-2`) Approach |
|---------|-----------------------------------|----------------|---------------------------|
| Replay browsing | File-based browsing / Google Forms era | Indexable list + detail + progressive timeline | Public `/stats/replays(/:id)(/events)` + sitemap |
| Stat explainability | Opaque numbers | "Explain WHY" bounty/squad effectiveness | Component-breakdown fields in responses |
| Unknown legacy data | Blanks / missing | First-class filterable unknown | Unknown enum + filter + provenance badges |
| Pagination | N/A (file lists) | 10k-100k row server-driven tables | Cursor + server-side sort everywhere |
| Identity | Manual / forms | Slug URLs, masked SteamID, dated history | slug→id, last-4 masking, history timelines |

## Sources

- `/home/afgan0r/Projects/SolidGames/web/gsd-briefs/web.md` — authoritative web product brief (Key Screens, Public Data Trust, Replay Pages, API Assumptions, STAT/SEO requirements). HIGH.
- `/home/afgan0r/Projects/SolidGames/web/.planning/sketches/{001,002,003}/README.md` + `003-olive-ledger-replays/index.html` — concrete column lists, replay detail/timeline fields, "Has unknowns", "request entrypoint", provenance labels. HIGH.
- `/home/afgan0r/Projects/SolidGames/server-2/.planning/PROJECT.md` — milestone scope, locked decisions, already-computed data, out-of-scope. HIGH.
- `/home/afgan0r/Projects/SolidGames/.planning/V2-CUTOVER-REVIEW.md` — gap map (sections A–G), locked v1 decisions, request-model/SSE deferral. HIGH.

---
*Feature research for: public read-API surface, server-2 v3.0 "Public API v1" milestone*
*Researched: 2026-05-31*
