/* eslint-disable no-magic-numbers */
import { describe, expect, it } from "vitest";

import {
  kdRatio,
  killsFromVehicleCoef,
  totalScore,
  weeklyScore,
} from "./parity-formulas.js";

describe("parity-formulas", () => {
  describe("kdRatio", () => {
    it("Returns rounded kills when deathsTotal is zero", () => {
      expect(kdRatio(0, 0)).toBe(0);
      expect(kdRatio(5, 0)).toBe(5);
    });

    it("Returns kills divided by deathsTotal rounded to two decimals", () => {
      expect(kdRatio(3, 2)).toBe(1.5);
    });
  });

  describe("totalScore", () => {
    it("Returns rounded difference of kills and teamkills", () => {
      expect(totalScore(10, 3)).toBe(7);
      expect(totalScore(2, 5)).toBe(-3);
    });
  });

  describe("weeklyScore", () => {
    it("Returns zero when no games were played", () => {
      expect(weeklyScore(1, 0, 0)).toBe(0);
    });

    it("Returns per-game score rounded to two decimals", () => {
      expect(weeklyScore(10, 2, 4)).toBe(2);
    });
  });

  describe("killsFromVehicleCoef", () => {
    it("Returns zero when kills is zero", () => {
      expect(killsFromVehicleCoef(0, 0)).toBe(0);
      expect(killsFromVehicleCoef(5, 0)).toBe(0);
    });

    it("Returns ratio of killsFromVehicle to kills rounded to two decimals", () => {
      expect(killsFromVehicleCoef(3, 10)).toBe(0.3);
    });
  });
});
