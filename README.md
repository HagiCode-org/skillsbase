# @hagicode/skillsbase

[中文文档](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40hagicode%2Fskillsbase?logo=npm&color=cb3837)](https://www.npmjs.com/package/@hagicode/skillsbase)
[![npm downloads](https://img.shields.io/npm/dm/%40hagicode%2Fskillsbase?logo=npm&color=2d8cf0)](https://www.npmjs.com/package/@hagicode/skillsbase)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

`skillsbase` is a standalone Node.js CLI for bootstrapping and maintaining managed skills repositories.
It ships the CLI and templates only. The generated `skills/` content belongs in the target repository, not in this package repository.

## Install

Requirements:

- Node.js `>= 22.12.0`
- npm `>= 10.9.2`

Install globally:

```bash
npm install --global @hagicode/skillsbase
```

Then run:

```bash
skillsbase --help
```

## Quick Start

Initialize a managed repository:

```bash
skillsbase init --repo /path/to/target-repo
```

Sync managed skills from `sources.yaml`:

```bash
skillsbase sync --repo /path/to/target-repo
```

Add one skill and sync immediately:

```bash
skillsbase add documentation-writer --repo /path/to/target-repo
```

Generate managed GitHub Actions assets:

```bash
skillsbase github_action --repo /path/to/target-repo --kind all
```

## Commands

| Command | Purpose | Example |
| --- | --- | --- |
| `init` | Create the managed repository baseline. | `skillsbase init --repo ./my-skills-repo` |
| `sync` | Reconcile managed skills from `sources.yaml`. | `skillsbase sync --repo ./my-skills-repo` |
| `sync --check` | Validate drift without writing files. | `skillsbase sync --check --repo ./my-skills-repo` |
| `add <skill-name>` | Add a skill to a source block, then run sync. | `skillsbase add documentation-writer --repo ./my-skills-repo` |
| `github_action` | Generate managed GitHub Actions workflow or action files. | `skillsbase github_action --repo ./my-skills-repo --kind workflow` |

Global options:

- `--repo <path>`: target repository path, defaults to the current directory
- `--help`, `-h`: show help
- `--version`, `-v`: show version

## Managed Repository Contract

`skillsbase` manages files in the target repository, including:

- `sources.yaml`: the single source of truth for source roots, naming rules, include lists, and defaults
- `skills/<name>/SKILL.md`: managed skill output converted from installed source content
- `skills/<name>/.skill-source.json`: source, conversion, target-path, and install metadata
- `docs/maintainer-workflow.md`: maintainer guidance generated from the bundled templates
- `.github/workflows/skills-sync.yml`: reusable workflow for validation and sync checks
- `.github/actions/skillsbase-sync/action.yml`: reusable composite action

## Non-Interactive Defaults

- The target repository defaults to the current working directory.
- `init` defaults the source roots to:
  - first-party: `$HOME/.agents/skills`
  - system: `$HOME/.codex/skills/.system`
- `add` writes to the first declared source block unless `--source <key>` is provided.
- `github_action` defaults to `--kind workflow`.
- When the CLI does not have enough context to write safely, it fails with diagnostics instead of prompting interactively.

## Development

Common commands for working on this package:

```bash
npm run build
npm run cli -- --help
npm test
npm run smoke
npm run pack:check
```

The published entry point is `bin/skillsbase.mjs`. In development, `npm run cli -- <args>` runs the TypeScript entry directly.
