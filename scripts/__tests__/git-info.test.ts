import { describe, it, expect } from 'vitest';
import { resolveGitInfo } from '../git-info.js';

describe('resolveGitInfo', () => {
  it('prefers live git over a stale version.json', () => {
    const info = resolveGitInfo({
      runGit: (cmd: string) => {
        if (cmd.includes('rev-parse --short HEAD')) return '2f1444d';
        if (cmd.includes('abbrev-ref')) return 'main';
        if (cmd.includes('describe')) return 'v2.5.0';
        if (cmd.includes('status')) return '';
        throw new Error(cmd);
      },
      existing: { commit: '15bddf8', branch: 'main', tag: 'v2.4.6', dirty: true },
    });
    expect(info.commit).toBe('2f1444d');
    expect(info.tag).toBe('v2.5.0');
    expect(info.dirty).toBe(false);
  });

  it('uses GIT_COMMIT / CapRover SHA when git is unavailable', () => {
    const info = resolveGitInfo({
      runGit: () => {
        throw new Error('not a git repo');
      },
      env: {
        GIT_COMMIT: 'bd0a2f09f9f4da8aca69eb9817608cf976f620d9',
        GIT_BRANCH: 'main',
        GIT_TAG: 'v2.5.0',
      },
      existing: { commit: '15bddf8', branch: 'old', tag: 'v2.4.6', dirty: true },
    });
    expect(info.commit).toBe('bd0a2f0');
    expect(info.branch).toBe('main');
    expect(info.tag).toBe('v2.5.0');
  });

  it('falls back to CAPROVER_GIT_COMMIT_SHA', () => {
    const info = resolveGitInfo({
      env: { CAPROVER_GIT_COMMIT_SHA: 'abcdef1234567890' },
      existing: { commit: '15bddf8' },
    });
    expect(info.commit).toBe('abcdef1');
  });

  it('uses committed version.json only when git and env are missing', () => {
    const info = resolveGitInfo({
      runGit: () => {
        throw new Error('no git');
      },
      env: {},
      existing: { commit: '15bddf8', branch: 'main', tag: 'v2.4.6', dirty: true },
    });
    expect(info.commit).toBe('15bddf8');
  });
});
