#!/usr/bin/env node
// Workbench engine. Generic on purpose: it knows nothing about any specific tool.
// All per-tool knowledge lives in tools/<name>/target.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const ROOT = import.meta.dirname;
const HOME = os.homedir();
const STATE = path.join(ROOT, '.installed.json');

const resolve = (p) => (p.startsWith('~') ? path.join(HOME, p.slice(1)) : path.resolve(ROOT, p));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const slash = (p) => p.replace(/\\/g, '/');
const short = (p) =>
  slash(p).startsWith(slash(HOME)) ? `~${slash(p).slice(slash(HOME).length)}` : slash(p);
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// --- shared source -----------------------------------------------------------

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

// Expand ${VAR} in every string. We do this rather than each tool: not all of them
// support expansion, and the ones that do disagree on the syntax.
function expandVars(value, env, missing) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (raw, name) => {
      if (env[name] == null || env[name] === '') {
        missing.add(name);
        return raw;
      }
      return env[name];
    });
  }
  if (Array.isArray(value)) return value.map((v) => expandVars(v, env, missing));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandVars(v, env, missing)]),
    );
  }
  return value;
}

function loadShared() {
  const env = loadEnv();
  const missing = new Set();
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/mcp.json'), 'utf8'));
  const mcp = expandVars(raw.mcpServers ?? raw, env, missing);

  // Emitting a literal ${VAR} would leave MCP servers that fail to connect for
  // reasons nothing explains. Refuse instead.
  if (missing.size) {
    fail(
      `Missing variables in .env.local: ${[...missing].join(', ')}\n` +
        '  Copy .env.example to .env.local and fill them in.',
    );
  }

  return {
    mcp,
    rules: fs.readFileSync(path.join(ROOT, 'shared/AGENTS.md'), 'utf8'),
    rulesPath: path.join(ROOT, 'shared/AGENTS.md'),
    home: HOME,
    root: ROOT,
  };
}

// --- safe writes -------------------------------------------------------------

function backup(dest) {
  // One of our own links is replaced without ceremony. Anything else is kept:
  // never clobber config the user wrote by hand.
  const link = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (!link) return null;
  if (link.isSymbolicLink()) {
    const points = fs.readlinkSync(dest);
    if (path.resolve(path.dirname(dest), points).startsWith(ROOT)) {
      fs.unlinkSync(dest);
      return null;
    }
  }
  const bak = `${dest}.bak-${stamp()}`;
  fs.renameSync(dest, bak);
  return bak;
}

function writeOut(dest, content, log) {
  const current =
    fs.existsSync(dest) && fs.statSync(dest).isFile() ? fs.readFileSync(dest, 'utf8') : null;
  if (current === content) return log(`  = ${short(dest)}`);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const bak = backup(dest);
  fs.writeFileSync(dest, content);
  log(`  ${bak ? '~' : '+'} ${short(dest)}${bak ? `  (backup: ${path.basename(bak)})` : ''}`);
}

function linkDir(src, dest, log) {
  const existing = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink() && fs.readlinkSync(dest).replace(/[\\/]+$/, '') === src) {
    return log(`  = ${short(dest)}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const bak = backup(dest);
  // 'junction' is the point on Windows: directory links without admin rights or
  // Developer Mode.
  fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
  log(`  → ${short(dest)}${bak ? `  (backup: ${path.basename(bak)})` : ''}`);
}

// --- targets -----------------------------------------------------------------

async function discoverTargets() {
  const dir = path.join(ROOT, 'tools');
  const found = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, 'target.mjs');
    if (!fs.existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file))).default;
    found.push({ ...mod, id: name, dir: path.join(dir, name) });
  }
  return found;
}

function applyTarget(target, ctx) {
  const lines = [];
  const log = (l) => lines.push(l);

  for (const [src, dest] of Object.entries(target.links ?? {})) {
    linkDir(path.join(target.dir, src), resolve(dest), log);
  }
  for (const [dest, render] of Object.entries(target.emit ?? {})) {
    const abs = resolve(dest);
    const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    const content = render({ ...ctx, dir: target.dir }, existing);
    if (content != null) writeOut(abs, content, log);
  }
  return lines;
}

// --- commands ----------------------------------------------------------------

async function pickTargets(targets, saved) {
  const installed = new Set(
    targets.filter((t) => fs.existsSync(resolve(t.detect))).map((t) => t.id),
  );
  const preset = new Set(saved ?? installed);

  console.log('\nWhich tools do you want to set up?\n');
  targets.forEach((t, i) => {
    const tag = saved?.includes(t.id) ? '  (set up here before)' : installed.has(t.id) ? '  (detected)' : '';
    console.log(`  ${i + 1}. [${preset.has(t.id) ? 'x' : ' '}] ${t.name}${tag}`);
  });

  // No TTY (CI, piped input) means nobody to ask: go with what is pre-checked.
  if (!process.stdin.isTTY) {
    console.log('\n(no interactive terminal — using the pre-checked ones)');
    return [...preset];
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\nComma-separated numbers, or Enter to accept: ')).trim();
  rl.close();

  if (!answer) return [...preset];
  return answer
    .split(',')
    .map((n) => targets[Number(n.trim()) - 1])
    .filter(Boolean)
    .map((t) => t.id);
}

async function install(argv) {
  const targets = await discoverTargets();
  const saved = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')).tools : null;

  const flag =
    argv.find((a) => a.startsWith('--tools='))?.split('=')[1] ??
    (argv.includes('--tools') ? argv[argv.indexOf('--tools') + 1] : null);

  let chosen;
  if (flag) chosen = flag.split(',').map((s) => s.trim());
  else if (saved && !argv.includes('--reconfigure')) chosen = saved;
  else chosen = await pickTargets(targets, saved);

  const unknown = chosen.filter((id) => !targets.some((t) => t.id === id));
  if (unknown.length) fail(`Unknown tools: ${unknown.join(', ')}`);
  if (!chosen.length) fail('No tools selected.');

  const ctx = loadShared();
  let failed = 0;

  for (const target of targets.filter((t) => chosen.includes(t.id))) {
    console.log(`\n${target.name}`);
    try {
      const lines = applyTarget(target, ctx);
      console.log(lines.length ? lines.join('\n') : '  (nothing to do)');
      if (target.note) console.log(`  ℹ ${target.note}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${err.message}`);
    }
  }

  fs.writeFileSync(STATE, `${JSON.stringify({ tools: chosen }, null, 2)}\n`);
  console.log(failed ? `\n✗ ${failed} tool(s) failed.\n` : '\n✓ Done.\n');
  if (failed) process.exit(1);
}

function linkHere() {
  const src = path.join(ROOT, 'shared/AGENTS.md');
  const dest = path.join(process.cwd(), 'AGENTS.md');
  backup(dest);
  try {
    fs.symlinkSync(src, dest, 'file');
    console.log(`✓ AGENTS.md → ${short(src)}`);
  } catch {
    // Windows requires Developer Mode for file symlinks. Copy and say so.
    fs.copyFileSync(src, dest);
    console.log("✓ AGENTS.md copied (not a symlink).\n  Re-run 'link-here' after editing shared/AGENTS.md.");
  }
}

const [cmd, ...argv] = process.argv.slice(2);
if (cmd === 'link-here') linkHere();
else await install([cmd, ...argv].filter(Boolean));
