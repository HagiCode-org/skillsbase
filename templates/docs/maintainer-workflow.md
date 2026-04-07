<!-- Managed by skillsbase CLI. -->

# Maintainer Workflow

The maintainer flow is `init -> add/remove -> sync -> github_action`.

## Lifecycle

1. `skillsbase init`
2. `skillsbase add <skill-name>` or `skillsbase remove <skill-name>`
3. `skillsbase sync`
4. `skillsbase github_action --kind all`

## GitHub Maintenance Path

Use `.github/workflows/skills-manage.yml` only for explicit non-interactive maintenance from GitHub UI.

- `operation` chooses `add`, `remove`, or `sync`
- `skill-name` is required for `add` and `remove`
- `source` is optional and maps to `--source`
- `allow-missing-sources` maps to `--allow-missing-sources`
- `run-tests` controls the post-operation `npm test`
- The workflow does not commit, push, or open pull requests

## Notes

- `sources.yaml` is the single source of truth.
- `skills/` stores managed output only.
- `.skill-source.json` records source and conversion metadata.
- `skillsbase sync --check` validates drift without writing files.
- If a source root is unavailable, use `skillsbase sync --allow-missing-sources` to skip it.
- Local CLI commands remain the primary maintainer path.
