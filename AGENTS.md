# Working on this repo

This repo *is* the AI config workbench — not a project it configures. Read this before
touching `tools/` or `workbench.mjs`. (`shared/AGENTS.md` is different: that's the
payload distributed *to* every other repo, general coding behavior, not about this one.)

## The contract

- `workbench.mjs` never learns about a specific tool. All tool knowledge lives in
  `tools/<name>/target.mjs`. If a change needs editing `workbench.mjs` to support one
  more tool, the target is wrong, not the engine.
- A target exports `name`, `detect`, and any of `links`, `emit`, `configure`, `note`.
  See README § "Adding a tool" for the shape and a full example.
- `emit` functions are pure: `(ctx, existing) => string | null`. No I/O inside them —
  writing, backing up and diffing is the engine's job.

## Hard rules, learned the hard way

- **Never `links` a whole directory that a tool already populates on its own.** A link
  replaces the destination wholesale. Codex, Cursor and OpenCode each keep their own
  populated `skills/`; linking over them once silently deleted Codex's built-in skills
  and OpenCode's whole skill set (both recovered from backup, see commit `383ab31`).
  Before adding a `links` entry, check what's really at the destination on a live
  machine first — `ls` it, don't assume it's empty.
- **`configure` must never overwrite a value it didn't set.** Read the current value
  first (`git config --global --get <key>` for a git-based one) and leave it alone if
  it's already something else. See `applyConfigure` in `workbench.mjs`.
- **Verify a tool's actual config format before writing its target — don't infer it
  from another tool.** The three incompatible MCP shapes, and Cursor having no global
  rules file at all, only surfaced by reading each tool's current docs, not by
  assuming they'd match Claude Code.
- **Test against a fake `$HOME` before running for real:**
  `HOME=/tmp/fakehome node workbench.mjs --tools <new-target>`. Confirms idempotency,
  merge safety and junction creation without touching real config.

## Where things are

README.md has the full layout, commands, and "Adding things" table — kept there since
humans read it too. This file is the subset an agent needs without being asked.
