# Contributing to skinbag.rent

Thanks for improving this project. We keep the workflow lightweight, but we do enforce a few quality and safety rules.

## Ground rules

- Be respectful, specific, and constructive in issues/PRs.
- Keep PRs small and focused (one feature/fix per PR).
- Prefer backward-compatible API changes. If breaking, document migration steps.
- Never commit secrets, private keys, or real wallet seed phrases.

## Ways to contribute

- Fix bugs or add tests/docs for existing behavior.
- Improve API and MCP tool reliability, observability, and safety.
- Improve UX copy and onboarding flows for humans and agents.
- Propose and implement new MCP tools through the request workflow.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Build check (required before PR):

```bash
npm run build
```

## Branch and commit conventions

- Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`
- If PR is AI-generated, use `codex/...` branch prefix.
- Prefer Conventional Commits (`feat:`, `fix:`, `docs:`, etc.).
- Write commit messages that explain *why*, not only *what*.

## Pull request checklist

Before opening PR, make sure:

- `npm run build` passes locally.
- API changes are reflected in `README.md` and/or API docs.
- DB schema changes include migration/init updates and seed compatibility.
- UI changes are tested on desktop and mobile breakpoints.
- You added or updated validation for new external inputs.

## MCP tool contributions (human review required)

All MCP tool additions/changes must pass a human review gate.

Required for MCP tool PRs:

1. Clear use case and threat model (abuse/fraud/spam impact).
2. Input/output schema and validation strategy.
3. Auth/permission model (who can call the tool).
4. Rollback plan if tool behavior is unsafe in production.
5. Explicit human maintainer approval before merge.

PRs adding MCP tools without human approval will not be merged.

## Security reporting

- Do **not** open public issues for vulnerabilities.
- Report privately to maintainers (or repository private security channel).
- Include reproduction steps, impact, and affected files/endpoints.

## License

By contributing, you agree your contributions are licensed under the project MIT license.
