---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
sourceLanguage: en-US
style: technical
---

# README requirements

## Audience and focus

- Address developers who use the `@hagicode/skillsbase` CLI to bootstrap and maintain managed skills repositories.
- State that the package ships the CLI and templates only; generated `skills/` content belongs in the target repository.

## Required content

- Keep install, quick start, commands, managed repository contract, non-interactive defaults, development, publishing notes and license.
- Command names must match `src/`.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README.zh-CN.md`, keeping the reciprocal language link at the top and the existing dot-form filename.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude npm tokens, secret values, internal hosts, machine-specific paths and private links.
