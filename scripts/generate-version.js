#!/usr/bin/env node

/**
 * Generate version.json file with git information
 * This is used during Docker builds where .git is not available
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const versionFile = join(__dirname, '..', 'version.json');

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    
    let tag = '';
    try {
      tag = execSync('git describe --tags --abbrev=0').toString().trim();
    } catch {
      // No tags found
      tag = '';
    }
    
    const dirty = execSync('git status --porcelain').toString().trim() !== '';
    
    return {
      commit,
      branch,
      tag,
      dirty,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('⚠️  Git not available:', error.message);
    
    // Check if version.json already exists (from previous commit)
    if (existsSync(versionFile)) {
      try {
        const existing = JSON.parse(readFileSync(versionFile, 'utf-8'));
        console.log('📦 Using existing version.json (committed version)');
        return existing;
      } catch (e) {
        console.warn('⚠️  Could not read existing version.json');
      }
    }
    
    // Create default version info when git is not available
    console.log('📦 Creating default version.json');
    return {
      commit: 'docker-build',
      branch: 'unknown',
      tag: '',
      dirty: false,
      timestamp: new Date().toISOString(),
    };
  }
}

const gitInfo = getGitInfo();

writeFileSync(versionFile, JSON.stringify(gitInfo, null, 2));

console.log('✅ Generated version.json:');
console.log(JSON.stringify(gitInfo, null, 2));

