import fs from 'node:fs';
import path from 'node:path';

export default {
  name: 'Claude Code',
  detect: '~/.claude',

  // What you edit often gets linked: repo changes apply live.
  links: {
    hooks: '~/.claude/hooks',
    skills: '~/.claude/skills',
  },

  emit: {
    '~/.claude/settings.json': (ctx) => {
      const base = JSON.parse(fs.readFileSync(path.join(ctx.dir, 'settings.base.json'), 'utf8'));
      return `${JSON.stringify({ ...base, mcpServers: ctx.mcp }, null, 2)}\n`;
    },

    // Claude Code resolves @ imports with ~, so no file symlink is needed here
    // (which on Windows would require Developer Mode). One line, still live.
    '~/.claude/CLAUDE.md': (ctx) => {
      const rel = path.relative(ctx.home, ctx.rulesPath).replace(/\\/g, '/');
      // The repo may live outside the home directory; ~/ is useless there.
      const ref = rel.startsWith('..') ? ctx.rulesPath.replace(/\\/g, '/') : `~/${rel}`;
      return `@${ref}\n`;
    },
  },
};
