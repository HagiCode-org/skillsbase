# skillsbase

`skillsbase` 是一个独立 Node CLI，用于初始化和维护“别的 skills 仓库”。
重点是：本仓库只放 CLI 代码与模板，不提交受管 `skills/` 内容。
当前源码使用 `TypeScript + Vite 8`。

## Commands

```bash
node ./bin/skillsbase.mjs init
node ./bin/skillsbase.mjs sync
node ./bin/skillsbase.mjs sync --check
node ./bin/skillsbase.mjs add <skill-name>
node ./bin/skillsbase.mjs github_action --kind all
```

开发期常用：

```bash
npm run build
npm run cli -- --help
npm test
npm run smoke
node ./bin/skillsbase.mjs <command> --repo /path/to/target-repo
```

打包产物仍为 `dist/cli.mjs`，`bin/skillsbase.mjs` 只负责发布态加载与开发态回退。

## npm Publish

- workflow: `.github/workflows/npm-publish-dev.yml`
- `push` 到 `main` 时发布 `dev` dist-tag
- GitHub Release `published` 且非 draft / prerelease 时发布 `latest`
- 发布前会执行：
  - `npm test`
  - `npm run pack:check`
- 当前包名：`@hagicode/skillsbase`

发布依赖 npm Trusted Publishing；仓库侧需要在 npm 绑定此 GitHub repository。

## Managed Repo Contract

- `sources.yaml`
  清单单一真相源，声明来源根目录、命名规则、包含列表与非交互默认值。
- `skills/<name>/SKILL.md`
  受管输出。内容来自当前仓库内临时 `npx skills add` 安装结果，再转换为最终形态。
- `skills/<name>/.skill-source.json`
  来源、转换、目标路径与安装元数据。
- `.github/workflows/skills-sync.yml`
  受管 workflow，执行 `npm test` 与 `skillsbase sync --check`。
- `.github/actions/skillsbase-sync/action.yml`
  可复用 composite action。

以上文件属于 **目标 skills 仓库**，不属于本 CLI 仓库本身。

## Non-Interactive Defaults

- 目标仓库默认为当前工作目录。
- `init` 默认来源根目录：
  - first-party: `$HOME/.agents/skills`
  - system: `$HOME/.codex/skills/.system`
- `add` 默认写入第一个已声明 source block。
- `github_action` 默认 `--kind workflow`。
- 若上下文不足以安全写入，命令直接失败并给出诊断；不会进入交互提问。

## Usage Notes

- `sync` 会执行“安装到当前仓库 -> 转换 -> 卸载临时产物 -> 对账写盘”闭环。
- `sync --check` 不修改最终仓库状态；若发现漂移则返回非零退出码。
- `sync --allow-missing-sources` 可在来源根目录暂缺时跳过该来源。
- `github_action` 仅覆盖带 `Managed by skillsbase CLI` 标记的文件；冲突文件需显式 `--force`。

## Development

- `npm test`
  跑 CLI 单测。
- `npm run smoke`
  在临时目录创建一个示例 managed repo，验证 `init -> sync -> sync --check -> github_action`。
