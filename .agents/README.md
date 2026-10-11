# Shared agent resources

`.agents` is the canonical directory for this repository's development skills
and agent resources. Tool-specific paths point here through tracked relative
symbolic links, so an edit is shared across tools without copying files.

## Layout

- `skills/<name>/SKILL.md`: repository development skills and their resources.
- `skills/kortyx`: symbolic link to `../../skills/kortyx`, the separately
  maintained portable application skill.
- `rules/kortyx-skills.mdc`: Cursor's rule pointing to the portable skill.
- Root [AGENTS.md](../AGENTS.md): repository policy and Definition of Done entry
  point. Root CLAUDE.md and GEMINI.md are symbolic links to that same file.

## Compatibility paths

| Path | Link target | Purpose |
| --- | --- | --- |
| `.cursor` | `.agents` | Existing Cursor rules and skills paths |
| `.claude` | `.agents` | Claude Code project skills |
| `.codex` | `.agents` | Requested compatibility alias; current Codex discovers `.agents/skills` directly |
| `.gemini` | `.agents` | Gemini CLI workspace skills |
| `.opencode` | `.agents` | OpenCode project skills |
| `.windsurf` | `.agents` | Legacy Windsurf workspace skills |
| `.devin` | `.agents` | Devin Desktop workspace skills |
| `.github/skills` | `../.agents/skills` | GitHub Copilot project skills; other GitHub files remain independent |

These paths expose the same filesystem content. Each tool still chooses which
skills to load and understands its own rule/configuration formats; the Cursor
`.mdc` rule is not a universal rule format. This migration preserves existing
skill contents and does not verify every skill in every agent runtime.

Current discovery paths are documented in the official guides for
[Codex](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills),
[Claude Code](https://code.claude.com/docs/en/skills),
[Gemini CLI](https://geminicli.com/docs/cli/skills/),
[OpenCode](https://opencode.ai/docs/skills/),
[Devin Desktop and Windsurf](https://docs.devin.ai/desktop/cascade/skills), and
[GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).

## Editing and local configuration

Edit `.agents/skills` and `.agents/rules` directly. For the portable Kortyx skill,
edit `skills/kortyx`; its shared skill entry is a link to that source.

Keep local credentials and generated state out of tracked shared files. The
previous local `general.mdc` and `mcp.json` ignore rules also apply under the new
canonical directory, and `settings.local.json` is ignored. Agent directories are
excluded from Docker build contexts.

Git checkouts must preserve symbolic links for the aliases to work. All link
targets are relative to the checkout, so no developer-specific absolute paths
are committed. Before adding an alias, check the tool's documented project skill
path and keep existing tool configuration intact.
