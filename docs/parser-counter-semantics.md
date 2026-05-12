# Parser Counter Semantics

This document defines how `server-2` interprets compact player counters from `replay-parser-2` for v2.0 backend parity work.

## Scope

This contract covers STAT-10 through STAT-15 from `.planning/REQUIREMENTS.md`.

`server-2` consumes parser artifacts. It does not parse OCAP replay contents and it does not decide Rust parser behavior.

## Preserved Counter Evidence

For every parser player row that includes compact counters, `server-2` persists a normalized `player_counter` parser event alongside the raw parser artifact snapshot.

The event payload preserves:

| Parser field | Normalized payload field | Meaning                                                                      |
| ------------ | ------------------------ | ---------------------------------------------------------------------------- |
| `k`          | `kills`                  | Parser compact kill count.                                                   |
| `tk`         | `teamkills`              | Parser compact teamkill count.                                               |
| `d`          | `deaths_total`           | Authoritative replay-level death count for public aggregate deaths.          |
| `td`         | `deaths_by_teamkills`    | Authoritative replay-level teamkill-death count for public aggregate deaths. |
| `su`         | `suicides`               | Suicide death evidence for parity/export diagnostics.                        |
| `nkd`        | `null_killer_deaths`     | Null-killer death evidence for parity/export diagnostics.                    |
| `ud`         | `unknown_deaths`         | Unknown-death evidence for parity/export diagnostics.                        |
| `vk`         | `vehicle_kills`          | Vehicle kill counter evidence for later export/detail surfaces.              |
| `kfv`        | `kills_from_vehicle`     | Kills-from-vehicle counter evidence for later export/detail surfaces.        |

The raw artifact snapshot remains the complete audit source. The normalized event exists so recalculation and later export/diff phases do not need ad hoc raw JSON traversal for counter evidence.

## Aggregate Death Semantics

When a `player_counter` event has death evidence for a resolved parser entity, `server-2` uses it for public aggregate death stats:

- `deaths.total` comes from `deaths_total`.
- `deaths.by_teamkills` comes from `deaths_by_teamkills`.

Kill-row victim deaths are fallback evidence only for parser entities that do not have compact death counters in the same replay. This prevents double-counting when both compact counters and relationship rows are present.

## Kill Row Responsibilities

`players[].kills[]` remains first-class evidence. It continues to drive:

- attacker kills;
- attacker teamkills;
- attacker-victim relationship rows;
- weapon attribution;
- vehicle context;
- bounty candidate events.

Compact counter events do not create kill relationship rows by themselves.

## Bounty Boundary

Bounty candidates are built only from kill relationship events:

- enemy kill rows can award bounty points when the victim resolves;
- teamkill rows award zero points with `excluded_reason = "teamkill"`;
- unknown/non-enemy kill rows award zero points with `excluded_reason = "non_enemy_kill"`;
- compact counters such as `su`, `nkd`, `ud`, `vk`, and `kfv` do not create bounty events.

Compact death counters can still affect future previous-rotation effectiveness because public death denominators are aggregate stats.

## Parser Contract Escalation

Open a `replay-parser-2` contract-support task only if backend parity work proves one of these blockers:

- a required compact counter is missing from the artifact;
- a required counter is ambiguous or not schema-documented;
- examples or fixtures do not cover a backend-critical death/teamkill/null-killer/unknown-death case;
- the parser schema version or worker contract must change for backend recalculation.

Parser-level differences that are not public product differences should be normalized in the later legacy public export or diff phases, not by broadening backend allowlists in this phase.
