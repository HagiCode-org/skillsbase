# skillsbase - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

`@hagicode/skillsbase` is a standalone Node.js CLI for bootstrapping and maintaining managed skills repositories. Published on npm. The CLI and templates ship from this repository; generated `skills/` content belongs in target repositories.

## Working Directory

Run commands from `repos/skillsbase/`.

## Key Commands

```bash
npm install
npm run build
npm run typecheck
npm test
npm run smoke
npm run pack:check
npm run cli -- --help
```

Requires Node.js 24+ (`engines` in `package.json`).

## Key Paths

- `bin/skillsbase.mjs`: CLI entrypoint
- `src/`: CLI source (`commands/` for init, sync, add, remove, github-action; `lib/` for the shared engine)
- `templates/`: skillsbase repository templates
- `scripts/`: package verification, smoke test and publish version helpers
- `tests/`: `node --test` suites run through `tsx`
- `.github/workflows/`: `npm-publish.yml` (push to `main` publishes the `dev` tag, a published release publishes `latest`) and `release-draft-action.yml` (drafts only, never publishes)

## Agent Guidelines

- Treat this as a published npm package; avoid breaking changes without version bumps.
- The CLI entrypoint is `bin/skillsbase.mjs`; keep the binary contract stable.
- Generated content belongs in target repositories, not here.
- If changing template structure, test against `skillsbase-template` and `myskills`.

## References

- `README.md`
- `README.zh-CN.md`
