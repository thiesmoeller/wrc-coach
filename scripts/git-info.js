/**
 * Resolve git version info for Settings and Docker builds.
 *
 * Order: live git repo → GIT_COMMIT / CAPROVER_GIT_COMMIT_SHA env →
 * committed version.json. Docker copies version.json but excludes .git,
 * so CI must pass the commit SHA as a build-arg or the Settings dialog
 * stays frozen on whatever was last written into version.json.
 */

function shortSha(sha) {
  if (!sha || typeof sha !== 'string') return '';
  const trimmed = sha.trim();
  if (!trimmed) return '';
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
}

export function resolveGitInfo({ runGit, env = {}, existing } = {}) {
  if (typeof runGit === 'function') {
    try {
      const commit = shortSha(runGit('git rev-parse --short HEAD'));
      if (commit) {
        let tag = '';
        try {
          tag = runGit('git describe --tags --abbrev=0') || '';
        } catch {
          tag = '';
        }
        let dirty = false;
        try {
          dirty = runGit('git status --porcelain') !== '';
        } catch {
          dirty = false;
        }
        let branch = 'unknown';
        try {
          branch = runGit('git rev-parse --abbrev-ref HEAD') || 'unknown';
        } catch {
          branch = 'unknown';
        }
        return {
          commit,
          branch,
          tag,
          dirty,
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // git binary missing or no repository (Docker image)
    }
  }

  const envCommit = shortSha(env.GIT_COMMIT || env.CAPROVER_GIT_COMMIT_SHA || '');
  if (envCommit) {
    return {
      commit: envCommit,
      branch: env.GIT_BRANCH || 'unknown',
      tag: env.GIT_TAG || '',
      dirty: false,
      timestamp: new Date().toISOString(),
    };
  }

  if (existing && existing.commit) {
    return existing;
  }

  return {
    commit: 'unknown',
    branch: 'unknown',
    tag: '',
    dirty: false,
    timestamp: new Date().toISOString(),
  };
}
