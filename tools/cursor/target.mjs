export default {
  name: 'Cursor',
  detect: '~/.cursor',

  emit: {
    // Same shape as Claude Code, goes in as-is.
    '~/.cursor/mcp.json': (ctx, existing) => {
      const base = existing ? JSON.parse(existing) : {};
      return `${JSON.stringify({ ...base, mcpServers: ctx.mcp }, null, 2)}\n`;
    },
  },

  // Cursor has no global location for rules: only a per-project AGENTS.md, or User
  // Rules, which live in their cloud with no file to version.
  note: "Rules: run 'node workbench.mjs link-here' inside each project.",
};
