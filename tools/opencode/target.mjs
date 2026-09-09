export default {
  name: 'OpenCode',
  detect: '~/.config/opencode',

  // NOTE: OpenCode reads SKILL.md from skills/, same convention as the other three,
  // but that directory already holds skills installed some other way. Replacing it
  // whole is unsafe, so we don't link it — see README.

  emit: {
    '~/.config/opencode/opencode.json': (ctx, existing) => {
      const base = existing ? JSON.parse(existing) : { $schema: 'https://opencode.ai/config.json' };

      // OpenCode folds command+args into one array and calls env "environment".
      const mcp = Object.fromEntries(
        Object.entries(ctx.mcp).map(([name, cfg]) => [
          name,
          {
            type: 'local',
            command: [cfg.command, ...(cfg.args ?? [])],
            enabled: true,
            ...(cfg.env ? { environment: cfg.env } : {}),
          },
        ]),
      );

      return `${JSON.stringify({ ...base, mcp }, null, 2)}\n`;
    },

    '~/.config/opencode/AGENTS.md': (ctx) => ctx.rules,
  },
};
