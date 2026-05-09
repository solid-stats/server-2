import type { ReferenceValidator, RequestReference } from "./models.js";

export class EmptyReferenceValidator implements ReferenceValidator {
  private readonly acceptedReferenceIds = new Set<string>();

  public async exists(reference: RequestReference): Promise<boolean> {
    return this.acceptedReferenceIds.has(reference.id);
  }
}
