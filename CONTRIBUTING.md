# Contributing

Thanks for helping! This project is early-stage; the best contributions right now are **requirements**, **protocol research**, and **testability guidance**.

## Branch Naming Convention

All branches must follow this naming pattern: `<type>/<description>`

**Valid types:**
- `feature/` - New features (e.g., `feature/add-session-tracking`)
- `bugfix/` - Bug fixes (e.g., `bugfix/fix-club-qso-count`)
- `hotfix/` - Urgent production fixes (e.g., `hotfix/critical-db-issue`)
- `docs/` - Documentation changes (e.g., `docs/update-api-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-stats`)

**Examples:**
```bash
git checkout -b feature/add-voice-rooms
git checkout -b bugfix/contest-stats-zero
git checkout -b docs/contributing-guide
```

## How to Contribute
1. Review docs/requirements.md and docs/architecture.md.
2. Open an issue using the templates in .github/ISSUE_TEMPLATE.
3. Create a feature branch following the naming convention above.
4. Submit PRs with clear scope and tests where applicable.

## Definition of Done
- Requirements: clearly stated, testable, and scoped.
- Code: includes tests or test plan where applicable.
- Docs: updated if behavior or architecture changes.

## Legal/Ethical
Do not include proprietary assets or decompiled content in this repo. Protocol analysis should be documented at a high level with independently derived observations.
