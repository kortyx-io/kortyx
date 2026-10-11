# Kortyx Skill

[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)

This directory is the source of truth for the portable Kortyx agent skill.

## Layout

- `kortyx/SKILL.md`: the only skill entrypoint.
- `kortyx/references/*.md`: modular topic rules loaded only when relevant.

Keep `SKILL.md` short. Put detailed hook, architecture, backend, and React rules in one-hop reference files, then link them from `SKILL.md`.

## Installing in agents

This repository already exposes `skills/kortyx` through the relative symbolic
link `.agents/skills/kortyx`. The [shared agent directory](../.agents/README.md)
and its tool-specific aliases make the same skill available without copying its
contents. Maintain this portable skill here; maintain repository development
skills under `.agents/skills`.

For use in another application, copy or symlink the `kortyx` folder into its
agent's skill location:

- Codex project skill: `.agents/skills/kortyx/SKILL.md`
- Codex personal skill: `~/.agents/skills/kortyx/SKILL.md`
- Claude Code project skill: `.claude/skills/kortyx/SKILL.md`
- Claude Code personal skill: `~/.claude/skills/kortyx/SKILL.md`
- Gemini CLI project skill: `.agents/skills/kortyx/SKILL.md` or `.gemini/skills/kortyx/SKILL.md`
- OpenCode project skill: `.agents/skills/kortyx/SKILL.md` or `.opencode/skills/kortyx/SKILL.md`
- GitHub Copilot project skill: `.agents/skills/kortyx/SKILL.md` or `.github/skills/kortyx/SKILL.md`
- Cursor project rule: `.cursor/rules/kortyx-skills.mdc` points at this skill;
  its canonical file in this repository is `.agents/rules/kortyx-skills.mdc`.

See the shared directory's linked official documentation for skill discovery
paths. Sharing directories does not convert one tool's rule or configuration
format into another tool's format.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
