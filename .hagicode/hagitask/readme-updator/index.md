---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
sourceLanguage: en-US
style: product
---

# README requirements

## Product focus

- Introduce `@hagicode/skillsbase` as a Node.js CLI that bootstraps and maintains managed skills repositories: `init` creates the baseline, `sync` and `sync --check` reconcile or verify skills from `sources.yaml`, `add` and `remove` change one skill and sync, and `github_action` generates managed GitHub Actions files.
- Address developers who use the CLI to run a skills repository; this is a developer-facing product, so command-level usage belongs in the README.
- State that the package ships the CLI and templates only; generated `skills/` content belongs in the target repository.
- Lead with what the CLI does and how to install and use it.

## Required content

- Keep install, quick start, the command table, the managed repository contract (the files the CLI manages in the target repository), non-interactive defaults and license.
- Command names must match `src/`; the license statement must match `LICENSE`.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README.zh-CN.md`, keeping the reciprocal language link at the top and the existing dot-form filename.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude npm tokens, secret values, internal hosts, machine-specific paths and private links.
- Keep repository maintenance instructions out of the README: development setup, test and packaging scripts, publishing and CI notes, and contribution workflow.
- Do not list commands the CLI does not provide.
