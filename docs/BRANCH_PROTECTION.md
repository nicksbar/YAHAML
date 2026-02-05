# Branch Protection Setup

This document describes the branch protection rules configured for this repository.

## Branch Protection Rules for `main`

The `main` branch is protected with the following rules:

### Required Status Checks
✅ **Require status checks to pass before merging**
- `test / Run Tests` - All tests must pass
- `branch-naming / Check Branch Naming` - Branch must follow naming convention

### Pull Request Requirements
✅ **Require a pull request before merging**
- At least 1 approval required (recommended for teams)
- Dismiss stale pull request approvals when new commits are pushed

### Additional Rules
✅ **Require conversation resolution before merging**
✅ **Do not allow bypassing the above settings**

## Setting Up Branch Protection (GitHub UI)

1. Go to: `https://github.com/nicksbar/YAHAML/settings/branches`
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
     - Add required checks: `test / Run Tests`, `branch-naming / Check Branch Naming`
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings
5. Click "Create" or "Save changes"

## Automated Checks

The GitHub Actions workflow (`.github/workflows/pr-checks.yml`) runs two checks on every PR:

### 1. Build & Test Check
- Installs dependencies
- Runs `npm run build`
- Runs `npm test`
- **Must pass** for PR to be mergeable

### 2. Branch Naming Check
- Validates branch follows pattern: `<type>/<description>`
- Valid types: `feature/`, `bugfix/`, `hotfix/`, `docs/`, `refactor/`
- **Must pass** for PR to be mergeable

## Branch Naming Convention

All feature branches must follow this pattern:

```
<type>/<description>
```

### Valid Types
- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring

### Examples
```bash
git checkout -b feature/add-voice-rooms
git checkout -b bugfix/contest-stats-zero
git checkout -b hotfix/critical-security-fix
git checkout -b docs/update-readme
git checkout -b refactor/simplify-relay-code
```

## Workflow

1. **Create a branch** following naming convention:
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make changes and commit**:
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin feature/my-new-feature
   ```

3. **Open a Pull Request** on GitHub
   - The PR template will guide you through the checklist
   - Automated checks will run automatically

4. **Wait for checks to pass**:
   - ✅ Build succeeds
   - ✅ Tests pass
   - ✅ Branch name is valid

5. **Get approval** (if required)

6. **Merge** the PR
   - Use "Squash and merge" for cleaner history (recommended)
   - Or "Create a merge commit" to preserve branch history

## Bypassing Checks (Emergency Only)

Repository admins can bypass branch protection in emergencies. However, this should be avoided except for:
- Critical production hotfixes
- Fixing broken CI/CD pipelines
- Emergency security patches

Always create a follow-up PR to fix any issues properly.
