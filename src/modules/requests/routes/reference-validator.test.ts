import { expect, it } from "vitest";

import { EmptyReferenceValidator } from "./reference-validator.js";

it("EmptyReferenceValidator should return false when any reference is passed", async () => {
  const validator = new EmptyReferenceValidator();

  await expect(
    validator.exists({
      id: "9f6d978c-2883-468b-bc5a-3f81ea6397ec",
      type: "replay",
    }),
  ).resolves.toBe(false);
});
