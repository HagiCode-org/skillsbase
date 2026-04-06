<!-- Managed by skillsbase CLI. -->

# Maintainer Workflow

结论是：维护流以 `init -> add -> sync -> github_action` 为主。

## Lifecycle

1. `skillsbase init`
2. `skillsbase add <skill-name>`
3. `skillsbase sync`
4. `skillsbase github_action --kind all`

## Notes

- `sources.yaml` 是单一真相源。
- `skills/` 仅保存受管输出。
- `.skill-source.json` 记录来源与转换元数据。
- `skillsbase sync --check` 只校验，不改仓库。
- 缺少来源根目录时，可用 `skillsbase sync --allow-missing-sources` 跳过。
