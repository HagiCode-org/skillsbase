<!-- Managed by skillsbase CLI. -->

# Maintainer Workflow

The maintainer flow is `init -> add -> sync -> github_action`.

## Lifecycle

1. `skillsbase init`
2. `skillsbase add <skill-name>`
3. `skillsbase sync`
4. `skillsbase github_action --kind all`

## Notes

- `sources.yaml` is the single source of truth.
- `skills/` stores managed output only.
- `.skill-source.json` records source and conversion metadata.
- `skillsbase sync --check` validates drift without writing files.
- If a source root is unavailable, use `skillsbase sync --allow-missing-sources` to skip it.
