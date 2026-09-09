# AI Workbench

My AI configuration, portable. One place for agent guidelines, MCP servers, plugins,
hooks and skills — installable on any machine, for Claude Code, Codex, Cursor and
OpenCode.

Working on this repo with an AI agent? `AGENTS.md` at the root loads automatically and
has the contract + the mistakes already made once — read that first.

## Install

```bash
git clone git@github.com:axel-lois/ai-workbench ~/.ai-workbench
cd ~/.ai-workbench
cp .env.example .env.local     # fill in the token
node workbench.mjs
```

Requires Node 18+. Zero npm dependencies.

The script detects which tools you already have and pre-checks them. Pick, and it writes
each one's config. "Git safety net" isn't an AI tool — it's a pre-commit hook, a global
gitignore, and a commit template, all set once via `git config --global` and always
pointing straight at this repo. Written after a real GitHub token almost got committed
while setting this repo up.

Update with `git pull && node workbench.mjs`.

## Commands

```bash
node workbench.mjs                       # install / refresh (idempotent)
node workbench.mjs --reconfigure         # pick tools again
node workbench.mjs --tools claude,codex  # non-interactive
node workbench.mjs link-here             # AGENTS.md in the current project
```

Cursor has no support for global rules — run `link-here` from the root of every project
where you use it.

## Layout

```
shared/          single source of truth
  AGENTS.md      agent behaviour
  mcp.json       MCP servers (secrets as ${VAR})
  skills/        SKILL.md skills — same convention across all four tools
tools/<name>/    one directory per tool
  target.mjs     where its files go and in what format
workbench.mjs    the engine — generic, knows nothing about any tool
```

**Link what you edit often, generate what differs per tool.** `hooks/` and `shared/skills/`
are linked into Claude Code, so editing the repo applies live. The MCP config files are
derived from `shared/mcp.json` in three incompatible formats, so they are generated and
refreshed by re-running the script.

On Windows, directory links are created as *junctions*: no admin rights, no Developer
Mode.

Nothing is clobbered silently — any existing file that isn't one of our links is moved to
`<file>.bak-<timestamp>` first.

### Skills are per-tool, on purpose

All four tools read the same `SKILL.md` convention, each from its own global directory
(`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`,
`~/.config/opencode/skills`) — but only Claude Code's is linked to `shared/skills/`. The
other three already have their own populated skills directories (Codex ships built-in
skills under `skills/.system/`; Cursor and OpenCode may hold skills installed some other
way), and a directory-level link would hide all of that, not merge with it. Sharing a
skill across every tool today means copying it into each tool's own skills folder by
hand.

## Adding things

| I want to… | I do |
|---|---|
| Add an MCP server | add it to `shared/mcp.json`, re-run the script |
| Change agent behaviour | edit `shared/AGENTS.md` — applies live |
| Add a Claude skill | drop it in `shared/skills/` — applies live |
| Add a Claude-only hook | drop it in `tools/claude/hooks/` — applies live |
| Add a Claude plugin | add it to `enabledPlugins` in `tools/claude/settings.base.json` |
| **Add a whole new tool** | create `tools/<name>/target.mjs` — the engine is never touched |

### Adding a tool

The engine discovers any `tools/*/target.mjs` on its own. A descriptor exports data and
pure functions: strings in, strings out. Writing, backing up and linking are the engine's
job.

```js
// tools/windsurf/target.mjs
export default {
  name: 'Windsurf',
  detect: '~/.codeium',                     // if it exists → pre-checked in the prompt
  links: { skills: '~/.codeium/skills' },   // source (relative to the target) → destination
  emit: {
    // (ctx, existing) → the full new contents. existing is null when there was no file.
    '~/.codeium/mcp_config.json': (ctx, existing) =>
      JSON.stringify({ ...JSON.parse(existing ?? '{}'), mcpServers: ctx.mcp }, null, 2),
  },
  note: 'optional line printed after the target runs',
};
```

`ctx` is `{ mcp, rules, rulesPath, home, root, dir }`, with `ctx.mcp` already expanded.

Merging lives in the target, not the engine: merging TOML looks nothing like merging JSON.

## Secrets

`shared/mcp.json` stores `${GITHUB_PERSONAL_ACCESS_TOKEN}`; the engine expands it at emit
time from `.env.local` and the environment. The engine does the expansion deliberately —
not every tool supports it, and the ones that do disagree on the syntax.

If a variable is missing it aborts and names it, rather than emitting a literal `${VAR}`
and leaving you to debug an MCP server that won't connect.

Emitted files hold the secret in cleartext in your home directory, like any MCP config.
Never in the repo.
