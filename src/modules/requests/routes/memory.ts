/* eslint-disable unicorn/no-null */
import { randomUUID } from "node:crypto";

import type {
  CreatePlayerRequestInput,
  PlayerRequest,
  PlayerRequestRepository,
} from "./models.js";

export class InMemoryPlayerRequestRepository implements PlayerRequestRepository {
  private readonly requests = new Map<string, PlayerRequest>();

  public async create(input: CreatePlayerRequestInput): Promise<PlayerRequest> {
    const now = new Date().toISOString(),
      request = {
        createdAt: now,
        description: input.description,
        id: randomUUID(),
        reference: input.reference ?? null,
        requesterUserId: input.requesterUserId,
        status: "submitted" as const,
        type: input.type,
        updatedAt: now,
      };
    this.requests.set(request.id, request);
    return request;
  }

  public async findForRequester(
    id: string,
    requesterUserId: string,
  ): Promise<PlayerRequest | null> {
    const request = this.requests.get(id);
    if (request?.requesterUserId !== requesterUserId) {
      return null;
    }
    return request;
  }

  public async listForRequester(
    requesterUserId: string,
  ): Promise<PlayerRequest[]> {
    return [...this.requests.values()]
      .filter((request) => request.requesterUserId === requesterUserId)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
