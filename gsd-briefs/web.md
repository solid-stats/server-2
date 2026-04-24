# web - GSD New Project Brief

**Created:** 2026-04-24  
**Intended command:** `$gsd-new-project --auto @gsd-briefs/web.md`  
**Application:** `web`

This document initializes the Solid Stats frontend application only. It is one part of the product alongside `server-2` and `replays-parser-2`.

## Product Context

Solid Stats is a public SolidGames statistics website and moderation interface. It replaces Google Forms and file-based stat browsing with a polished mobile-first web app for stats, profiles, requests, moderation, and admin workflows.

`web` owns the browser UI and user experience. It consumes APIs from `server-2`. It does not parse replay files directly and does not own PostgreSQL/RabbitMQ/S3 infrastructure.

## Core Value

Make SolidGames statistics easy to inspect, filter, trust, and correct through a fast public website and clear request/moderation flows.

## Design Direction

- Brand/product name: Solid Stats.
- Visual direction: mobile-first esports ops.
- The site is a functional statistics product, not a marketing landing page.
- Prioritize dense but readable data, fast filtering, strong profiles, clear request flows, and efficient moderator/admin screens.
- Use a polished gaming/esports feel without sacrificing readability or accessibility.
- Public stats are available without login.
- Steam login is required for requests and account-specific pages.
- UI must support Russian and English from the start.

## Frontend Stack

- React.
- TSX.
- TanStack Router.
- TanStack Query.
- Nano Stores.
- vanilla-extract.

## Users

### Public Visitor

- Views public stats without login.
- Searches players and squads.
- Opens player/squad/rotation/commander/bounty pages.

### Player

- Logs in through Steam OAuth via `server-2`.
- Submits correction/identity requests.
- Uploads evidence attachments.
- Tracks request status and moderator decisions.

### Moderator

- Reviews request queue.
- Opens request details, evidence, linked entities, and audit context.
- Approves/rejects with a comment.
- Manually fills old commander-side winner data when needed.

### Admin

- Manages moderator/admin roles.
- Manages rotations.
- Reviews parse job/failure status where exposed by `server-2`.

## v1 Scope

### Public Pages

- Stats overview.
- Player list with search/filtering.
- Player profile.
- Squad list with search/filtering.
- Squad profile.
- Rotation pages or rotation filter views.
- Commander-side stats.
- Bounty stats/leaderboards.

### Authenticated Player Pages

- Steam OAuth login/session UI.
- Request submission.
- Evidence attachment upload.
- Request status/history.

### Moderator/Admin Pages

- Request queue.
- Request detail/review.
- Request approval/rejection with comment.
- Admin role management.
- Admin rotation management.
- Parser/job failure visibility if API is available.

### Out of Scope

- Rust parser implementation.
- Backend API implementation.
- PostgreSQL/RabbitMQ/S3 infrastructure.
- Google Forms.
- Financial reward/payment UI.
- Supporting replay upload UX beyond the API-backed flows explicitly required by `server-2`.
- Full marketing/news portal unless later added.

## UX Requirements

### Mobile-First

- Mobile is the primary target.
- Public stats must be usable on phone screens.
- Dense tables need mobile-specific layouts such as compact rows, sticky context, filters, or responsive detail views.
- Desktop must still support large tables and moderator productivity.

### Accessibility

- Visible focus states.
- Keyboard navigation for menus, forms, dialogs, tabs, and tables.
- Sufficient color contrast.
- No icon-only buttons without labels/tooltips/aria labels.
- Form fields have visible labels.
- Errors appear near fields and are understandable.
- Upload/progress states are clear.

### Performance

- Use route-level splitting where useful.
- Use TanStack Query caching for stats.
- Avoid blocking public pages on unnecessary authenticated data.
- Keep filtering/searching responsive.
- Use skeleton/loading states for stats and request pages.

### Internationalization

- Russian and English required from the start.
- UI strings should not be hardcoded directly in components without an i18n path.
- Default can be Russian unless user/browser preference indicates otherwise.

## Key Screens

### Stats Overview

- Shows current/high-level stats.
- Entry points to players, squads, rotations, commander stats, and bounty stats.
- Public and fast.

### Player Profile

- Current display name.
- Nickname history.
- Steam/account link state where public-safe.
- Current/previous squad history.
- Rotation stats.
- Bounty-related stats.
- Links to relevant replays or stat details where API supports them.

### Squad Profile

- Current/known squad identity.
- Historical membership view where available.
- Squad rotation stats.
- Squad effectiveness inputs relevant to bounty scoring.

### Commander-Side Stats

- Commander-side games.
- Wins/losses where known.
- Unknown outcomes for legacy data.
- Filters by rotation/player/side where API supports it.

### Bounty Stats

- Per-rotation bounty leaderboards.
- Enemy-kill based points.
- Clear distinction that this is points/statistics only, not money.
- Ideally show why a kill was valuable: victim player effectiveness component plus squad effectiveness component when API provides it.

### Request Submission

- User chooses request type.
- User links relevant player/replay/squad/stat where possible.
- User writes description.
- User uploads evidence attachments.
- Form validates and shows upload/submit progress.
- Success state clearly shows created request and next step.

### Moderator Request Queue

- Filter by status/type/date.
- Shows requester, request type, affected entity, age, and priority/status.
- Mobile usable, desktop efficient.

### Request Detail

- Shows submitted text, attachments, linked entities, current stats/context, and audit history.
- Moderator can approve/reject with required comment.
- Approved corrections should make clear that `server-2` will recalculate aggregates.

## API Assumptions

`web` consumes `server-2` APIs for:

- Public stats.
- Player/squad/rotation/commander/bounty data.
- Steam OAuth/session.
- Request creation/status.
- Attachment upload.
- Moderator actions.
- Admin roles.
- Admin rotations.
- Job/failure visibility.

Prefer generated API types or a shared OpenAPI/schema contract so frontend and backend can evolve independently.

## Suggested Requirements

### App Foundation

- **APP-01**: React/TSX project is configured with TanStack Router.
- **APP-02**: TanStack Query is configured for API data fetching and caching.
- **APP-03**: Nano Stores is configured for lightweight client state.
- **APP-04**: vanilla-extract is configured for styling and design tokens.
- **APP-05**: RU+EN i18n foundation exists.

### Public Stats

- **STAT-01**: Public visitor can view stats overview without login.
- **STAT-02**: Public visitor can search/filter players.
- **STAT-03**: Public visitor can open player profile.
- **STAT-04**: Public visitor can search/filter squads.
- **STAT-05**: Public visitor can open squad profile.
- **STAT-06**: Public visitor can view rotation-filtered stats.
- **STAT-07**: Public visitor can view commander-side stats.
- **STAT-08**: Public visitor can view bounty stats.

### Authenticated Player UX

- **AUTH-01**: User can start Steam OAuth login.
- **AUTH-02**: App reflects logged-in/logged-out session state.
- **REQ-01**: Logged-in player can submit correction/identity request.
- **REQ-02**: Request form supports evidence attachment upload.
- **REQ-03**: Player can view request status and decision.

### Moderation/Admin

- **MOD-01**: Moderator can view request queue.
- **MOD-02**: Moderator can review request detail and attachments.
- **MOD-03**: Moderator can approve/reject with comment.
- **ADMIN-01**: Admin can manage roles.
- **ADMIN-02**: Admin can manage rotations.
- **OPS-01**: Admin/moderator can view parser/job failures if API supports it.

### UX Quality

- **UX-01**: Mobile layouts are first-class for public stats.
- **UX-02**: Desktop layouts support efficient table-heavy workflows.
- **UX-03**: Forms have visible labels, inline validation, loading, success, and error states.
- **UX-04**: Interactive elements are keyboard accessible.
- **UX-05**: UI uses accessible contrast and focus states.

## Suggested GSD Initialization Settings

- Granularity: Standard.
- Execution: Parallel where possible.
- Git tracking: Yes.
- Research: Yes.
- Plan Check: Yes.
- Verifier: Yes.
- Model profile: Balanced or Quality.

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Product name | Solid Stats |
| Frontend stack | React + TSX |
| Router | TanStack Router |
| Data fetching | TanStack Query |
| Client state | Nano Stores |
| Styling | vanilla-extract |
| Auth source | Steam OAuth through `server-2` |
| Public stats | Visible without login |
| Languages | Russian and English |
| Design direction | Mobile-first esports ops |
| Parser ownership | `replays-parser-2` |
| Backend ownership | `server-2` |

## Follow-Up Details for Implementation Phases

- Exact visual identity tokens: palette, typography, spacing, component density.
- Exact i18n library.
- Exact generated API type strategy.
- Exact mobile table patterns after API payloads are known.
- Whether replay upload/job views are admin-only in v1 or deferred.

