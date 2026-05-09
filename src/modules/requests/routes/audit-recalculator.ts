import type {
  AuditPatchRecalculator,
  CreateAuditPatchInput,
} from "./models.js";

export class NoopAuditPatchRecalculator implements AuditPatchRecalculator {
  public readonly status = "recalculated";

  public async recalculateForPatch(input: CreateAuditPatchInput): Promise<{
    status: string;
  }> {
    void input;
    return { status: this.status };
  }
}
