import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkAppWorkflowBoundary,
  runAppWorkflowBoundaryGuardOperation,
} from "./check-app-boundary-guards.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories) {
    await rm(directory, { force: true, recursive: true });
  }
  temporaryDirectories.length = 0;
});

describe("checkAppWorkflowBoundary", () => {
  it("Allows app workflows that only verify and build images", async () => {
    const root = await testRoot({
      "cd.yml": `
name: CI
jobs:
  verify:
    steps:
      - run: pnpm run verify
  image:
    steps:
      - uses: docker/build-push-action@v7
`,
      "notes.txt": "kubectl rollout status deployment/server-2\n",
    });

    await expect(checkAppWorkflowBoundary(root)).resolves.toEqual([]);
    await expect(runAppWorkflowBoundaryGuardOperation(root)).resolves.toBe(0);
  });

  it("Reports forbidden orchestration commands in workflow files", async () => {
    const root = await testRoot({
      "deploy.yaml": `
name: Deploy
jobs:
  deploy:
    steps:
      - run: ssh deploy@example.test kubectl -n solid-stats-staging rollout status deployment/server-2
      - run: kubectl create secret generic server-2
      - run: KUBECONFIG=/tmp/kubeconfig kubectl apply -f deploy.yaml
`,
    });

    await expect(checkAppWorkflowBoundary(root)).resolves.toEqual([
      {
        file: ".github/workflows/deploy.yaml",
        match: "kubectl",
        rule: "kubectl",
      },
      {
        file: ".github/workflows/deploy.yaml",
        match: "ssh",
        rule: "staging-ssh",
      },
      {
        file: ".github/workflows/deploy.yaml",
        match: "create secret",
        rule: "kubernetes-secret-mutation",
      },
      {
        file: ".github/workflows/deploy.yaml",
        match: "rollout",
        rule: "rollout-orchestration",
      },
      {
        file: ".github/workflows/deploy.yaml",
        match: "KUBECONFIG",
        rule: "kubernetes-config",
      },
    ]);
  });

  it("Writes actionable findings and ignores missing workflow directories", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "server-2-empty-"));
    temporaryDirectories.push(emptyRoot);
    await expect(checkAppWorkflowBoundary(emptyRoot)).resolves.toEqual([]);

    const root = await testRoot({
      "deploy.yml":
        "steps:\n  - run: scp manifest.yaml deploy@example.test:/tmp/\n",
    });
    const written: string[] = [];

    await expect(
      runAppWorkflowBoundaryGuardOperation(root, (content) => {
        written.push(content);
      }),
    ).resolves.toBe(1);
    expect(written.join("")).toContain("staging-ssh");
    expect(written.join("")).toContain(".github/workflows/deploy.yml");
  });

  it("Reports nested workflow findings through the default error writer", async () => {
    const root = await testRoot({
      "deploy/manual.yml":
        "steps:\n  - run: rsync manifest.yaml deploy@example.test:/tmp/\n",
    });
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(runAppWorkflowBoundaryGuardOperation(root)).resolves.toBe(1);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining(".github/workflows/deploy/manual.yml"),
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining("staging-ssh"),
    );
  });

  it("Surfaces workflow path errors other than missing directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "server-2-invalid-workflows-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".github"), { recursive: true });
    await writeFile(join(root, ".github", "workflows"), "not a directory\n");

    await expect(checkAppWorkflowBoundary(root)).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });
});

async function testRoot(workflows: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "server-2-workflow-")),
    workflowDirectory = join(root, ".github", "workflows");
  temporaryDirectories.push(root);
  await mkdir(workflowDirectory, { recursive: true });
  for (const [fileName, content] of Object.entries(workflows)) {
    const workflowFile = join(workflowDirectory, fileName);
    await mkdir(dirname(workflowFile), { recursive: true });
    await writeFile(workflowFile, content);
  }
  return root;
}
