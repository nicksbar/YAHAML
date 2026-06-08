# Contributing to YAHAML

Welcome! This guide will help you contribute to YAHAML, a production-ready field-day logging platform for amateur radio operators.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Naming Convention](#branch-naming-convention)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Security](#security)
- [Legal/Ethical Guidelines](#legalethical-guidelines)

## Code of Conduct

Please be respectful and inclusive in all contributions. We value diverse perspectives and experiences in the amateur radio community.

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Docker (for deployment testing)
- Git
- Basic understanding of TypeScript/JavaScript

### Setup
```bash
# Install dependencies
npm install

# Generate database types
npm run db:generate

# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed

# Start development (API + Frontend)
npm run dev:all
```

### Development Environments
- **API Server:** http://localhost:3000
- **Frontend:** http://localhost:5173
- **Database:** SQLite (development), Postgres (production)

## Development Workflow

### Local Development
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd yahaml-relay
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development**
   ```bash
   npm run dev:all
   ```

### Testing Your Changes
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:browser

# Watch mode for development
npm run test:watch
```

## Branch Naming Convention

All branches must follow this naming pattern: `<type>/<description>`

**Valid types:**
- `feature/` - New features (e.g., `feature/add-session-tracking`)
- `bugfix/` - Bug fixes (e.g., `bugfix/fix-club-qso-count`)
- `hotfix/` - Urgent production fixes (e.g., `hotfix/critical-db-issue`)
- `docs/` - Documentation changes (e.g., `docs/update-api-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-stats`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`)

**Examples:**
```bash
git checkout -b feature/add-voice-rooms
git checkout -b bugfix/contest-stats-zero
git checkout -b docs/contributing-guide
git checkout -b refactor/improve-error-handling
```

## Pull Request Guidelines

### PR Requirements
- [ ] Clear title and description
- [ ] Relevant issue reference
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or clearly marked)
- [ ] Code passes linting
- [ ] All tests passing

### PR Title Format
```
[type]: Brief description of changes

Example:
[feature]: Add WebSocket auto-reconnect
[bugfix]: Fix duplicate band occupancy
```

### PR Description Template
```markdown
## What does this PR change?
- Brief description of changes
- Problem solved or feature added

## Why is this needed?
- Context or background
- Related issues or user stories

## Testing
- How to test the changes
- Test cases covered

## Documentation
- Documentation files updated
- New documentation added

## Breaking Changes
- List any breaking changes
- Migration steps if needed

## Screenshots (if applicable)
- Add screenshots of UI changes
```

## Code Style

### TypeScript
- Use strict TypeScript with no `any` types
- Prefer interfaces over types for object shapes
- Use descriptive naming conventions
- Add JSDoc comments for public APIs

### ESLint
- Run `npm run lint` before committing
- Fix all reported issues
- Configure `.eslintrc.cjs` for your needs

### Code Formatting
- Use Prettier for consistent formatting
- Maximum line length: 100 characters
- 2-space indentation
- Single quotes for strings

### Documentation
- Add JSDoc comments to functions
- Document parameters and return values
- Include examples where helpful

## Testing

### Unit Tests
- Test individual functions in isolation
- Use Jest for testing
- Aim for >80% code coverage

### Integration Tests
- Test API endpoints
- Test database operations
- Test WebSocket connections

### E2E Tests
- Test complete user workflows
- Test critical paths
- Use Playwright for browser testing

### Test Naming
```typescript
describe('[Feature]', () => {
  describe('[Scenario]', () => {
    it('should [action]', () => {
      // test implementation
    });
  });
});
```

## Documentation

### Where to Document
- [docs/INDEX.md](docs/INDEX.md) - Main documentation index
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [docs/API.md](docs/API.md) - API documentation
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide

### Documentation Standards
- Use clear, concise language
- Include code examples
- Document edge cases
- Update docs when code changes

## Security

### Security Checklist
- [ ] Input validation on all endpoints
- [ ] No sensitive data in logs
- [ ] Proper error messages (no stack traces)
- [ ] Environment variables for secrets
- [ ] No hardcoded credentials

### Security Testing
- Run security audits before PR
- Use dependency checkers
- Test for common vulnerabilities

## Legal/Ethical Guidelines

### Protocol Research
- Document protocol analysis at a high level
- Do not include proprietary assets
- Use independently derived observations
- Respect copyright and licensing

### Code Quality
- Do not include decompiled content
- Ensure original code quality
- Follow licensing requirements

## Questions?

If you have questions about contributing:
1. Check the [main documentation](docs/INDEX.md)
2. Review [STATUS.md](STATUS.md) for current progress
3. Open an issue for clarification
4. Join the community discussions

## Thank You!

Your contributions help make YAHAML better for the amateur radio community. We appreciate your time and effort!
