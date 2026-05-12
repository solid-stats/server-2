import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { Dirent } from "node:fs";

export interface WorkflowBoundaryFinding {
  file: string;
  match: string;
  rule: string;
}

interface ForbiddenWorkflowRule {
  id: string;
  pattern: RegExp;
}

const WORKFLOW_DIRECTORY = ".github/workflows",
  forbiddenWorkflowRules: ForbiddenWorkflowRule[] = [
    { id: "kubectl", pattern: /\bkubectl\b/iu },
    { id: "staging-ssh", pattern: /\b(?:ssh|scp|rsync)\b/iu },
    {
      id: "kubernetes-secret-mutation",
      pattern:
        /\b(?:create|apply|patch|delete)\b[^\n]*\bsecret\b|\bkind:\s*Secret\b/iu,
    },
    { id: "rollout-orchestration", pattern: /\brollout\b|\bset\s+image\b/iu },
    { id: "kubernetes-config", pattern: /\bKUBECONFIG\b|\bkubeconfig\b/iu },
  ];

export async function checkAppWorkflowBoundary(
  rootDirectory = process.cwd(),
): Promise<WorkflowBoundaryFinding[]> {
  const workflowDirectory = join(rootDirectory, WORKFLOW_DIRECTORY),
    files = await workflowFiles(workflowDirectory),
    findings: WorkflowBoundaryFinding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const rule of forbiddenWorkflowRules) {
      const match = content.match(rule.pattern);
      if (match?.[0] === undefined) {
        continue;
      }
      findings.push({
        file: relative(rootDirectory, file),
        match: match[0],
        rule: rule.id,
      });
    }
  }
  return findings;
}

export async function runAppWorkflowBoundaryGuardOperation(
  rootDirectory = process.cwd(),
  writeError: (content: string) => void = (content) =>
    process.stderr.write(content),
): Promise<number> {
  const findings = await checkAppWorkflowBoundary(rootDirectory);
  if (findings.length === 0) {
    return 0;
  }
  writeError(
    `${findings.map((finding) => findingMessage(finding)).join("\n")}\n`,
  );
  return 1;
}

async function workflowFiles(directory: string): Promise<string[]> {
  const entries = await readDirectoryEntries(directory);
  if (entries === undefined) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await workflowFiles(path)));
      continue;
    }
    if (entry.isFile() && isWorkflowFile(entry.name)) {
      files.push(path);
    }
  }
  return files.toSorted();
}

async function readDirectoryEntries(
  directory: string,
): Promise<Dirent[] | undefined> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isWorkflowFile(fileName: string): boolean {
  return fileName.endsWith(".yml") || fileName.endsWith(".yaml");
}

function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function findingMessage(finding: WorkflowBoundaryFinding): string {
  return `${finding.file} violates app workflow boundary (${finding.rule}): ${finding.match}`;
}

const [, entrypointPath] = process.argv;

/* v8 ignore next 6 -- exercised by the package script entrypoint. */
if (
  entrypointPath !== undefined &&
  import.meta.url === `file://${entrypointPath}`
) {
  process.exitCode = await runAppWorkflowBoundaryGuardOperation();
}
