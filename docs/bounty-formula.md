# Bounty Formula

Solid Stats v1 bounty points are non-financial gameplay scoring. They reward valid enemy kills using the killed player's previous-rotation effectiveness and the killed squad's previous-rotation effectiveness.

## Formula

```text
base_score = 1
player_factor = previous_rotation_victim_player_kills / max(1, previous_rotation_victim_player_deaths)
squad_factor = previous_rotation_victim_squad_kills / max(1, previous_rotation_victim_squad_deaths)
points = base_score * (1 + player_factor) * (1 + squad_factor)
```

Points are rounded to two decimal places before persistence.

## Missing Evidence

- Missing previous player stats use `player_factor = 0`.
- Missing previous squad stats or missing victim squad membership use `squad_factor = 0`.
- Previous stats with invalid or incomplete `kills` / `deaths.total` evidence are ignored and use factor `0`.

## Exclusions

- Teamkills award `0` points and record `excluded_reason = "teamkill"` in `bounty_points.inputs`.
- Unknown or non-enemy kill classifications award `0` points and record `excluded_reason = "non_enemy_kill"`.
- Enemy kills whose victim cannot be resolved award `0` points and record `excluded_reason = "missing_victim"`.

## Persistence

`bounty_points` stores one row per attacker player and rotation. The `points` column stores the total rounded score. The `inputs` JSONB column stores formula version, base score, total points, and per-event evidence used to calculate or exclude each candidate kill.
