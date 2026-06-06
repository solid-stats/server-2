export function kdRatio(kills: number, deathsTotal: number): number {
  if (deathsTotal === 0) {
    return round(kills);
  }
  return round(kills / deathsTotal);
}

export function killsFromVehicleCoef(
  killsFromVehicle: number,
  kills: number,
): number {
  if (kills === 0) {
    return 0;
  }
  return round(killsFromVehicle / kills);
}

export function totalScore(kills: number, teamkills: number): number {
  return round(kills - teamkills);
}

export function weeklyScore(
  kills: number,
  teamkills: number,
  totalPlayedGames: number,
): number {
  if (totalPlayedGames === 0) {
    return 0;
  }
  return round((kills - teamkills) / totalPlayedGames);
}

export function round(value: number): number {
  const factor = 100;
  return Math.round(value * factor) / factor;
}
