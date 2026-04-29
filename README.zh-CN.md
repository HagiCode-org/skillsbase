# @hagicode/skillsbase

[English README](./README.md)

[![npm version](https://img.shields.io/npm/v/%40hagicode%2Fskillsbase?logo=npm&color=cb3837)](https://www.npmjs.com/package/@hagicode/skillsbase)
[![npm downloads](https://img.shields.io/npm/dm/%40hagicode%2Fskillsbase?logo=npm&color=2d8cf0)](https://www.npmjs.com/package/@hagicode/skillsbase)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

`skillsbase` 是一个独立的 Node.js CLI，用于初始化并维护受管 skills 仓库。
本仓库只提供 CLI 与模板，不提交目标仓库中的 `skills/` 产物。

## 安装

要求：

- Node.js `>= 22.12.0`
- npm `>= 10.9.2`

全局安装：

```bash
npm install --global @hagicode/skillsbase
```

安装后可直接执行：

```bash
skillsbase --help
```

## 快速开始

初始化受管仓库：

```bash
skillsbase init --repo /path/to/target-repo
```

按 `sources.yaml` 同步技能：

```bash
skillsbase sync --repo /path/to/target-repo
```

添加单个技能并立即同步：

```bash
skillsbase add documentation-writer --repo /path/to/target-repo
```

删除单个技能并立即同步：

```bash
skillsbase remove documentation-writer --repo /path/to/target-repo
```

生成受管 GitHub Actions 资产：

```bash
skillsbase github_action --repo /path/to/target-repo --kind all
```

## 命令

| 命令 | 用途 | 示例 |
| --- | --- | --- |
| `init` | 创建受管仓库基础结构 | `skillsbase init --repo ./my-skills-repo` |
| `sync` | 按 `sources.yaml` 对账并同步技能 | `skillsbase sync --repo ./my-skills-repo` |
| `sync --check` | 只校验漂移，不写文件 | `skillsbase sync --check --repo ./my-skills-repo` |
| `add <skill-name>` | 将技能写入 source block 后执行同步 | `skillsbase add documentation-writer --repo ./my-skills-repo` |
| `remove <skill-name>` | 从 source block 删除技能后执行同步 | `skillsbase remove documentation-writer --repo ./my-skills-repo` |
| `github_action` | 生成受管 GitHub Actions 工作流或 action 文件 | `skillsbase github_action --repo ./my-skills-repo --kind workflow` |

全局选项：

- `--repo <path>`：目标仓库路径，默认当前目录
- `--help`、`-h`：显示帮助
- `--version`、`-v`：显示版本

## 受管仓库约定

`skillsbase` 会在目标仓库中管理以下文件：

- `sources.yaml`：来源根目录、命名规则、包含列表与默认值的单一真相源
- `skills/<name>/SKILL.md`：由安装源内容转换得到的受管技能输出
- `skills/<name>/.skill-source.json`：来源、转换、目标路径与安装元数据
- `docs/maintainer-workflow.md`：由模板生成的维护说明
- `.github/workflows/skills-sync.yml`：用于校验与同步检查的工作流
- `.github/actions/skillsbase-sync/action.yml`：可复用 composite action

## 非交互默认行为

- 目标仓库默认是当前工作目录。
- `init` 默认来源根目录为：
  - first-party：`$HOME/.agents/skills`
  - system：`$HOME/.codex/skills/.system`
- `add` 默认写入第一个已声明的 source block；如需指定，传 `--source <key>`。
- `remove` 若仅命中一个 source block，会直接删除；若同名技能存在于多个 source block，必须显式传 `--source <key>`。
- `add`、`remove`、`sync` 均接受 `--allow-missing-sources`，以便在 CI 或仓库外 cwd 下保持一致的路径解析与失败语义。
- `github_action` 默认使用 `--kind workflow`。
- 若上下文不足以安全写入，CLI 会直接失败并输出诊断，不会进入交互提问。

## 开发

常用命令：

```bash
npm run build
npm run cli -- --help
npm test
npm run smoke
npm run pack:check
```

发布入口为 `bin/skillsbase.mjs`。开发期可用 `npm run cli -- <args>` 直接运行 TypeScript 入口。

## 发布说明

GitHub Actions 发布流支持两种 npm 认证模式：

- 推荐：GitHub Actions OIDC 的 npm trusted publishing
- 兜底：仓库 `NPM_TOKEN` secret，经 `NODE_AUTH_TOKEN` 注入

若使用 trusted publishing，需先在 npm 的 `@hagicode/skillsbase` 包设置中，将 `HagiCode-org/skillsbase` 配置为 trusted publisher。
在 npm trusted publisher 设置里填写的 workflow filename 应为 `npm-publish.yml`，不要填完整的 `.github/workflows/...` 路径。
如果这个包还没有首发，只要 npm 上已经存在 `hagicode` scope，且当前发布身份有权创建 `@hagicode/skillsbase`，也仍然可以正常发布。
npm 官方当前要求 Node.js `>= 22.14.0` 且 npm `>= 11.5.1`。
