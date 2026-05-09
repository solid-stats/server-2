import type { AuthRouteOptions } from "../../auth/routes/models.js";

export type PlayerRequestType =
  | "identity_correction"
  | "merge_split"
  | "stats_correction"
  | "steam_link";

export type RequestStatus =
  | "approved"
  | "cancelled"
  | "in_review"
  | "rejected"
  | "submitted";

export type ReferencedEntityType = "player" | "replay" | "squad" | "stat";

export interface RequestReference {
  id: string;
  type: ReferencedEntityType;
}

export interface PlayerRequest {
  createdAt: string;
  description: string;
  id: string;
  reference: RequestReference | null;
  requesterUserId: string;
  status: RequestStatus;
  type: PlayerRequestType;
  updatedAt: string;
}

export interface CreatePlayerRequestInput {
  description: string;
  reference?: RequestReference;
  requesterUserId: string;
  type: PlayerRequestType;
}

export interface PlayerRequestRepository {
  create(input: CreatePlayerRequestInput): Promise<PlayerRequest>;
  findForRequester(
    id: string,
    requesterUserId: string,
  ): Promise<PlayerRequest | null>;
  listForRequester(requesterUserId: string): Promise<PlayerRequest[]>;
}

export interface ReferenceValidator {
  exists(reference: RequestReference): Promise<boolean>;
}

export interface RequestRouteOptions {
  auth: AuthRouteOptions;
  references: ReferenceValidator;
  requests: PlayerRequestRepository;
}
