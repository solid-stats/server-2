import type { AuthRouteOptions } from "../../auth/routes/models.js";

/**
 * Admin rotation write surface (API-04 / D-04).
 *
 * Constraint-signal strategy (single, consistent strategy — see plan Task 1):
 *   Every expected outcome is modelled as a discriminated *result*, never a thrown
 *   pg error. The repository catches the DB constraint violations it owns
 *   (name UNIQUE `23505` → `name_conflict`; the `ends_at > starts_at` CHECK `23514`
 *   → `invalid_range`) and the unknown-id / dependency outcomes, and surfaces them
 *   as result discriminants. The route layer (18-04) maps:
 *     - `name_conflict`   → 409
 *     - `invalid_range`   → 422
 *     - `not_found`       → 404
 *     - `has_dependents`  → 409
 *   Unexpected pg errors (anything other than 23505/23514) still throw — those are
 *   genuine faults, not business outcomes.
 */

export interface AdminRotationRow {
  endsAt: string | null;
  id: string;
  name: string;
  slug: string;
  startsAt: string;
}

export interface CreateRotationInput {
  endsAt: string | null;
  name: string;
  startsAt: string;
}

/** Full-replace update: same shape as create (no partial patch). */
export type UpdateRotationInput = CreateRotationInput;

export type RotationConstraintSignal = "invalid_range" | "name_conflict";

export type CreateRotationResult =
  | { rotation: AdminRotationRow; status: "created" }
  | { signal: RotationConstraintSignal; status: "constraint" };

export type UpdateRotationResult =
  | { rotation: AdminRotationRow; status: "updated" }
  | { signal: RotationConstraintSignal; status: "constraint" }
  | { status: "not_found" };

export type DeleteRotationResult =
  | { status: "deleted" }
  | { status: "has_dependents" }
  | { status: "not_found" };

export interface AdminRotationRepository {
  createRotation(input: CreateRotationInput): Promise<CreateRotationResult>;
  deleteRotation(id: string): Promise<DeleteRotationResult>;
  updateRotation(
    id: string,
    input: UpdateRotationInput,
  ): Promise<UpdateRotationResult>;
}

export interface AdminRouteOptions {
  auth: AuthRouteOptions;
  rotations: AdminRotationRepository;
}
