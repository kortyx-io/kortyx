# Kortyx Skill

[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)

This directory is the source of truth for the portable Kortyx agent skill.

## Layout

- `kortyx/SKILL.md`: the only skill entrypoint.
- `kortyx/references/*.md`: modular topic rules loaded only when relevant.

Keep `SKILL.md` short. Put detailed hook, architecture, backend, and React rules in one-hop reference files, then link them from `SKILL.md`.

## Installing in agents

Use these files as the canonical source, then copy or symlink them into the tool-specific location:

- Codex personal skill: `~/.codex/skills/kortyx/SKILL.md`
- Claude Code project skill: `.claude/skills/kortyx/SKILL.md`
- Claude Code personal skill: `~/.claude/skills/kortyx/SKILL.md`
- Cursor stable project context: use `.cursor/rules/kortyx-skills.mdc` to point Cursor at this skill.

Cursor may also expose Skills in some builds, but project rules under `.cursor/rules` are the stable documented mechanism.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
