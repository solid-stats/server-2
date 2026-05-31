---
name: <kebab-case-slug>
title: <short pattern title>
category: <request|response|schema|naming|ids|errors|security|auth|wording|cosmetic>
kind: <core|feature>
severity_when_violated: <BLOCKER|HIGH|MEDIUM|LOW|NIT>
applies_to:
  - <trigger context: pagination endpoints, multipart endpoints, any spec, etc.>
related:
  - <slug of a related pattern>
source:
  - core-conventions.md#<anchor if any>
  - empirical (<where this was observed>)
---

# <Pattern title>

## Rule

The normative rule in 1-3 sentences. No code, no long caveats. If the rule has variants, list them as bullets.

## When it applies

Triggers that make this pattern relevant. For example:
- the endpoint returns a collection;
- the service is not the multipart-exception service and the body is `multipart/form-data`;
- a schema extends another schema.

## How to detect a violation

Concrete detection steps for an author self-checking, or a reviewer:
- which keys to look for (`limit`, `offset`, `data`, `total`);
- which structural cues indicate a violation;
- which cross-file checks are needed.

## Severity and risk

Why a violation lands at the chosen severity. The practical risk to implementation, contract, compatibility, security, or moderation.

## Good example

Reference a real spec with `path:line` and a one-line note on why it is exemplary. Don't paste large fragments.

## Anti-example

A recorded violation (with a reference) or a minimal synthetic example (4-8 lines) that shows what's wrong, followed immediately by the fix that makes it correct.

## Related patterns

- [[other-pattern-slug]] — how it relates (complements, requires, conflicts).

## Reviewer notes

Optional: edge cases, exceptions, known false positives.
