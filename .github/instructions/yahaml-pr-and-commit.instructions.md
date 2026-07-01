---
description: "Use when preparing commits/PRs for YAHAML. Enforces concise commit quality and deployment-aware PR summaries."
applyTo: "**/*"
---

# YAHAML Commit and PR Instructions

## Commit quality

- Use focused commit messages tied to user-visible behavior or bug class.
- Avoid mixing unrelated refactors with bugfix commits.

## PR checklist

Include in PR description:

1. What changed (behavior-level)
2. Why it changed (problem/risk addressed)
3. Validation run (build/tests)
4. Deployment or ops impact (if any)

## Required validation notes

At minimum for touched scope:

- `npm run build` for backend/shared changes
- `npm -C ui run build` for frontend/routing changes

## Safety expectations

- Call out any potential breaking changes explicitly.
- Document any config/environment assumptions.
- If no breaking changes: state that clearly.
