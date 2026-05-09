import type { ReferenceValidator, RequestReference } from "../models.js";

export const replayId = "00000000-0000-4000-8000-000000000701";

export class FakeReferenceValidator implements ReferenceValidator {
  private readonly references = new Set<string>();

  public allow(reference: RequestReference): void {
    this.references.add(referenceKey(reference));
  }

  public exists(reference: RequestReference): Promise<boolean> {
    return Promise.resolve(this.references.has(referenceKey(reference)));
  }
}

function referenceKey(reference: RequestReference): string {
  return `${reference.type}:${reference.id}`;
}
