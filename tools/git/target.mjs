import path from 'node:path';

export default {
  name: 'Git safety net',
  detect: '~/.gitconfig',

  // Nothing to emit: each key points straight at a file in this repo, so edits
  // apply immediately with no re-run needed.
  configure: {
    'core.hooksPath': (ctx) => path.join(ctx.dir, 'hooks'),
    'core.excludesfile': (ctx) => path.join(ctx.dir, 'gitignore'),
    'commit.template': (ctx) => path.join(ctx.dir, 'commit-template.txt'),
  },

  note: 'Pre-commit hook scans staged changes for secret-shaped strings; bypass a false positive with --no-verify.',
};
