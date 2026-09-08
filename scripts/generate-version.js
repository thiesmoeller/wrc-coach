#!/usr/bin/env node

/**
 * Generate version.json file with git information.
 * Used during Docker builds where .git is not in the build context.
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveGitInfo } from './git-info.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const versionFile = join(__dirname, '..', 'version.json');

function runGit(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

let existing;
if (existsSync(versionFile)) {
  try {
    existing = JSON.parse(readFileSync(versionFile, 'utf-8'));
  } catch {
    existing = undefined;
  }
}

const gitInfo = resolveGitInfo({
  runGit,
  env: process.env,
  existing,
});

writeFileSync(versionFile, JSON.stringify(gitInfo, null, 2) + '\n');

console.log('✅ Generated version.json:');
console.log(JSON.stringify(gitInfo, null, 2));
