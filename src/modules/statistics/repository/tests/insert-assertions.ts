import { bountyInsertParameters, type ScriptedClient } from "./utilities.js";

/** Number of issued queries whose normalized SQL starts with `prefix`. */
export function countQueries(client: ScriptedClient, prefix: string): number {
  return client.queries.filter((sql) => sql.startsWith(prefix)).length;
}

/**
 * Reconstructs the per-row bounty tuples from the single batched `unnest` insert
 * (FINDING 5). The replace now issues ONE multi-row insert per scope with params
 * `[rotationId, gameType, playerId[], points[], inputsJson[]]`; this re-zips each
 * scope's batched params back into the prior per-row shape
 * `[rotationId, playerId, points, inputs, gameType]` (parsing the jsonb-serialized
 * `inputs` back to an object) so the existing byte-identity assertions read
 * unchanged. Each element of the outer array is one persisted row, preserving the
 * insert order across both scopes (per-rotation then all-time for sg).
 */
export function bountyInsertRows(client: ScriptedClient): unknown[][] {
  return bountyInsertParameters(client).flatMap((parameters) => {
    const [rotationId, gameType, playerIds, points, inputs] = parameters as [
      string | null,
      string | null,
      string[],
      number[],
      string[],
    ];
    return inputs.map((inputJson, row) => [
      rotationId,
      playerIds[row],
      points[row],
      JSON.parse(inputJson) as unknown,
      gameType,
    ]);
  });
}
