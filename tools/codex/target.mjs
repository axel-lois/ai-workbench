// Codex is the only one that isn't JSON. Minimal serializer — not worth a dependency.

const str = (v) => JSON.stringify(v); // TOML and JSON escape basic strings the same way
const value = (v) =>
  Array.isArray(v)
    ? `[${v.map(str).join(', ')}]`
    : v && typeof v === 'object'
      ? `{ ${Object.entries(v).map(([k, x]) => `${k} = ${str(x)}`).join(', ')} }`
      : str(v);

const toToml = (mcp) =>
  Object.entries(mcp)
    .map(([name, cfg]) =>
      [
        `[mcp_servers.${name}]`,
        ...Object.entries(cfg).map(([k, v]) => `${k} = ${value(v)}`),
      ].join('\n'),
    )
    .join('\n\n');

// Drop the [mcp_servers.*] sections and leave everything else untouched: config.toml
// is shared by the Codex CLI, the VS Code extension and the app, and holds plugin and
// marketplace state we did not write.
function stripMcp(toml) {
  let keep = true;
  return toml
    .split('\n')
    .filter((line) => {
      const header = line.match(/^\s*\[+\s*([^\]\s]+)/);
      if (header) keep = !/^mcp_servers(\.|$)/.test(header[1]);
      return keep;
    })
    .join('\n')
    .trimEnd();
}

export default {
  name: 'Codex',
  detect: '~/.codex',

  emit: {
    '~/.codex/config.toml': (ctx, existing) => {
      const head = existing ? stripMcp(existing) : '';
      return `${[head, toToml(ctx.mcp)].filter(Boolean).join('\n\n')}\n`;
    },

    // Codex documents no import syntax, so this is a copy. Re-run to refresh it.
    '~/.codex/AGENTS.md': (ctx) => ctx.rules,
  },
};
