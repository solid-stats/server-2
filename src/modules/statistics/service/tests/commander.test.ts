import { expect, it } from "vitest";

/* eslint-disable unicorn/no-null */
import { calculateCommanderSideAggregates } from "../commander.js";

it("Counts known wins and losses by commander side", () => {
  const result = calculateCommanderSideAggregates([
    {
      commanders: [
        { playerId: "west-commander", side: "west" },
        { playerId: "east-commander", side: "east" },
      ],
      outcome: { status: "known", winnerSide: "west" },
      replayId: "replay-1",
    },
  ]);

  expect(result).toEqual([
    {
      knownLosses: 1,
      knownWins: 0,
      playerId: "east-commander",
      side: "east",
      unknownOutcomes: 0,
    },
    {
      knownLosses: 0,
      knownWins: 1,
      playerId: "west-commander",
      side: "west",
      unknownOutcomes: 0,
    },
  ]);
});

it("Counts unknown outcomes separately from known wins and losses", () => {
  const result = calculateCommanderSideAggregates([
    {
      commanders: [{ side: "west" }],
      outcome: { status: "unknown" },
      replayId: "replay-1",
    },
    {
      commanders: [{ side: "west" }],
      outcome: { status: "inferred" },
      replayId: "replay-2",
    },
  ]);

  expect(result).toEqual([
    {
      knownLosses: 0,
      knownWins: 0,
      playerId: null,
      side: "west",
      unknownOutcomes: 2,
    },
  ]);
});

it("Merges repeated commander rows and sorts anonymous side aggregates first", () => {
  const result = calculateCommanderSideAggregates([
    {
      commanders: [
        { side: "west" },
        { playerId: "west-commander", side: "west" },
      ],
      outcome: { status: "known", winnerSide: "east" },
      replayId: "replay-1",
    },
    {
      commanders: [{ playerId: "west-commander", side: "west" }],
      outcome: { status: "known", winnerSide: "west" },
      replayId: "replay-2",
    },
  ]);

  expect(result).toEqual([
    {
      knownLosses: 1,
      knownWins: 0,
      playerId: null,
      side: "west",
      unknownOutcomes: 0,
    },
    {
      knownLosses: 1,
      knownWins: 1,
      playerId: "west-commander",
      side: "west",
      unknownOutcomes: 0,
    },
  ]);
});

it("Sorts named commander side aggregates by normalized side and player id", () => {
  const result = calculateCommanderSideAggregates([
    {
      commanders: [
        { playerId: "west-bravo", side: "West" },
        { playerId: "east-alpha", side: "East" },
        { playerId: "west-alpha", side: "West" },
      ],
      outcome: { status: "known", winnerSide: "west" },
      replayId: "replay-1",
    },
  ]);

  expect(result).toEqual([
    {
      knownLosses: 1,
      knownWins: 0,
      playerId: "east-alpha",
      side: "east",
      unknownOutcomes: 0,
    },
    {
      knownLosses: 0,
      knownWins: 1,
      playerId: "west-alpha",
      side: "west",
      unknownOutcomes: 0,
    },
    {
      knownLosses: 0,
      knownWins: 1,
      playerId: "west-bravo",
      side: "west",
      unknownOutcomes: 0,
    },
  ]);
});
