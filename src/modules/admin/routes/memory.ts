import { randomUUID } from "node:crypto";

import type {
  AdminRotationRepository,
  AdminRotationRow,
  CreateRotationInput,
  CreateRotationResult,
  DeleteRotationResult,
  UpdateRotationInput,
  UpdateRotationResult,
} from "./models.js";

/**
 * In-memory admin rotation repository for `buildApp()` defaults and route-layer
 * tests. It mirrors the observable contract of `PgAdminRotationRepository`:
 *   - slug is ALWAYS server-derived from the name (never client-supplied);
 *   - a duplicate name → `name_conflict` (the route maps it to 409);
 *   - `endsAt` not strictly after `startsAt` → `invalid_range` (route → 422);
 *   - unknown id on update/delete → `not_found`;
 *   - a rotation marked as having dependents → `has_dependents` (route → 409).
 *
 * Dependents are tracked by id via `markDependents` so the delete-blocked
 * behaviour can be exercised without a live database.
 */
export class InMemoryAdminRotationRepository
  implements AdminRotationRepository
{
  private readonly rotationsById = new Map<string, AdminRotationRow>();

  private readonly dependents = new Set<string>();

  public markDependents(id: string): void {
    this.dependents.add(id);
  }

  public async createRotation(
    input: CreateRotationInput,
  ): Promise<CreateRotationResult> {
    const rangeSignal = invalidRange(input);
    if (rangeSignal !== undefined) {
      return rangeSignal;
    }
    if (this.nameTaken(input.name, undefined)) {
      return { signal: "name_conflict", status: "constraint" };
    }
    const rotation: AdminRotationRow = {
      endsAt: input.endsAt,
      id: randomUUID(),
      name: input.name,
      slug: slugBase(input.name),
      startsAt: input.startsAt,
    };
    this.rotationsById.set(rotation.id, rotation);
    return { rotation, status: "created" };
  }

  public async updateRotation(
    id: string,
    input: UpdateRotationInput,
  ): Promise<UpdateRotationResult> {
    if (!this.rotationsById.has(id)) {
      return { status: "not_found" };
    }
    const rangeSignal = invalidRange(input);
    if (rangeSignal !== undefined) {
      return rangeSignal;
    }
    if (this.nameTaken(input.name, id)) {
      return { signal: "name_conflict", status: "constraint" };
    }
    const rotation: AdminRotationRow = {
      endsAt: input.endsAt,
      id,
      name: input.name,
      slug: slugBase(input.name),
      startsAt: input.startsAt,
    };
    this.rotationsById.set(id, rotation);
    return { rotation, status: "updated" };
  }

  public async deleteRotation(id: string): Promise<DeleteRotationResult> {
    if (!this.rotationsById.has(id)) {
      return { status: "not_found" };
    }
    if (this.dependents.has(id)) {
      return { status: "has_dependents" };
    }
    this.rotationsById.delete(id);
    return { status: "deleted" };
  }

  private nameTaken(name: string, exceptId: string | undefined): boolean {
    for (const rotation of this.rotationsById.values()) {
      if (rotation.name === name && rotation.id !== exceptId) {
        return true;
      }
    }
    return false;
  }
}

function invalidRange(
  input: CreateRotationInput,
): { signal: "invalid_range"; status: "constraint" } | undefined {
  if (input.endsAt === null) {
    return undefined;
  }
  if (Date.parse(input.endsAt) > Date.parse(input.startsAt)) {
    return undefined;
  }
  return { signal: "invalid_range", status: "constraint" };
}

function slugBase(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug === "" ? "rotation" : slug;
}
