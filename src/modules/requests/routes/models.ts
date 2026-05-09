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

export interface RequestAttachment {
  checksum: string | null;
  contentType: string;
  createdAt: string;
  fileName: string;
  id: string;
  objectKey: string;
  requestId: string;
  sizeBytes: number;
}

export type RequestModerationActionType = "approve" | "reject";

export interface RequestModerationAction {
  action: RequestModerationActionType;
  comment: string;
  createdAt: string;
  id: string;
  moderatorUserId: string;
  requestId: string;
}

export interface AuditPatch {
  affectedEntityId: string | null;
  affectedEntityType: string;
  createdAt: string;
  id: string;
  patch: Record<string, unknown>;
  reason: string;
  recalculationStatus: string;
  requestId: string;
}

export interface CreatePlayerRequestInput {
  description: string;
  reference?: RequestReference;
  requesterUserId: string;
  type: PlayerRequestType;
}

export interface CreateRequestAttachmentInput {
  checksum?: string;
  contentType: string;
  fileName: string;
  objectKey: string;
  requestId: string;
  sizeBytes: number;
}

export interface CreateRequestAttachmentUploadInput {
  contentType: string;
  fileName: string;
  requestId: string;
  sizeBytes: number;
}

export interface RequestAttachmentUpload {
  expiresAt: string;
  headers: Record<string, string>;
  objectKey: string;
  uploadUrl: string;
}

export interface DecideRequestInput {
  action: RequestModerationActionType;
  comment: string;
  moderatorUserId: string;
  requestId: string;
}

export interface DecideRequestResult {
  action: RequestModerationAction;
  request: PlayerRequest;
}

export interface CreateAuditPatchInput {
  affectedEntityId?: string;
  affectedEntityType: string;
  patch: Record<string, unknown>;
  reason: string;
  recalculationStatus: string;
  requestId: string;
}

export interface PlayerRequestRepository {
  create(input: CreatePlayerRequestInput): Promise<PlayerRequest>;
  findForRequester(
    id: string,
    requesterUserId: string,
  ): Promise<PlayerRequest | null>;
  listForRequester(requesterUserId: string): Promise<PlayerRequest[]>;
}

export interface RequestAttachmentRepository {
  create(input: CreateRequestAttachmentInput): Promise<RequestAttachment>;
  listForRequest(requestId: string): Promise<RequestAttachment[]>;
}

export interface RequestAttachmentStorage {
  createUpload(
    input: CreateRequestAttachmentUploadInput,
  ): Promise<RequestAttachmentUpload>;
}

export interface RequestModerationRepository {
  decide(input: DecideRequestInput): Promise<DecideRequestResult | null>;
  findForModeration(id: string): Promise<PlayerRequest | null>;
  listActions(requestId: string): Promise<RequestModerationAction[]>;
  listForModeration(): Promise<PlayerRequest[]>;
}

export interface AuditPatchRepository {
  createAuditPatch(input: CreateAuditPatchInput): Promise<AuditPatch>;
  listAuditPatchesForRequest(requestId: string): Promise<AuditPatch[]>;
}

export interface AuditPatchRecalculator {
  recalculateForPatch(input: CreateAuditPatchInput): Promise<{
    status: string;
  }>;
}

export interface ReferenceValidator {
  exists(reference: RequestReference): Promise<boolean>;
}

export interface RequestRouteOptions {
  attachmentStorage: RequestAttachmentStorage;
  attachments: RequestAttachmentRepository;
  auditPatches: AuditPatchRepository;
  auditRecalculator: AuditPatchRecalculator;
  auth: AuthRouteOptions;
  moderation: RequestModerationRepository;
  references: ReferenceValidator;
  requests: PlayerRequestRepository;
}
