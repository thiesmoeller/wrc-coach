# Release Process

This document describes how to create and deploy new releases of WRC Coach.

## Quick Release (Recommended)

Use the automated release script:

```bash
npm run release
```

This script will:
1. ✅ Check that your working directory is clean
2. 📝 Prompt you to choose a version (patch/minor/major/custom)
3. 💬 Ask for release notes
4. 📦 Generate `version.json` with git information
5. 💾 Commit changes with proper message
6. 🏷️ Create a git tag
7. 📋 Show you next steps for pushing and deploying

### Example Session

```bash
$ npm run release

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     WRC Coach Release Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Working directory is clean

Current version: v2.0.1

How do you want to bump the version?
  1) patch (2.0.1 -> 2.0.2)
  2) minor (2.0.1 -> 2.1.0)
  3) major (2.0.1 -> 3.0.0)
  4) custom version
  5) use current version (2.0.1)

Enter choice [1-5]: 1

New version will be: v2.0.2

Enter release notes (press Ctrl+D when done):
- Fixed session management state issues
- Added safe auto-update mechanism
- Replaced native confirm dialogs with React components
^D

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating Release v2.0.2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Generating version.json...
✅ Generated version.json
📦 Committing changes...
🏷️ Creating git tag...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Release v2.0.2 created successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
  1. Review the changes: git show
  2. Push to remote:     git push && git push --tags
  3. Deploy to CapRover: git push caprover main

Or to undo this release:
  git tag -d v2.0.2
  git reset --hard HEAD~1
```

## Manual Release (Advanced)

If you prefer to do it manually:

### 1. Update Version

```bash
# Patch version (2.0.1 -> 2.0.2)
npm version patch

# Minor version (2.0.1 -> 2.1.0)
npm version minor

# Major version (2.0.1 -> 3.0.0)
npm version major

# Custom version
npm version 2.5.0
```

### 2. Generate Version File

```bash
npm run version:generate
```

This creates `version.json` with:
- Git commit hash
- Branch name
- Tag name
- Dirty flag (uncommitted changes)
- Timestamp

### 3. Commit and Tag

```bash
git add version.json
git commit -m "Release v2.0.2"
git tag -a v2.0.2 -m "Release v2.0.2

- Feature 1
- Feature 2
- Bug fixes"
```

### 4. Push to Remote

```bash
# Push commits
git push origin main

# Push tags
git push origin --tags
```

### 5. Deploy to CapRover

```bash
git push caprover main
```

## Version File Explained

The `version.json` file is automatically generated and contains:

```json
{
  "commit": "ff96df4",      // Short commit hash
  "branch": "main",          // Git branch
  "tag": "v2.0.1",          // Most recent tag
  "dirty": false,            // Uncommitted changes?
  "timestamp": "2025-..."    // When generated
}
```

This file is:
- ✅ **Committed** as part of each release
- ✅ **Used in Docker builds** (where .git is not available)
- ✅ **Displayed in app** (Settings → Version Information)

## Docker Build Process

When building for Docker/CapRover:

1. `version.json` is included in the build context
2. `npm run build` is called
3. The `prebuild` script runs `generate-version.js`
4. If `version.json` exists → use it (Docker build)
5. If not → fall back to git commands (local dev)
6. Version info is compiled into the app

## Troubleshooting

### "Working directory is not clean"

You have uncommitted changes. Either commit them first or stash them:

```bash
git status
git add .
git commit -m "Your changes"
# OR
git stash
```

### Release script fails

Check that:
- You're on the correct branch
- You have permission to create tags
- Node.js is installed and working
- Git is configured properly

### Version not showing in deployed app

1. Check that `version.json` was committed:
   ```bash
   git show HEAD:version.json
   ```

2. Check the build logs for "Using version from version.json"

3. Verify the file is in the Docker image:
   ```bash
   docker run -it <image> ls -la /app/version.json
   ```

### Want to remove a tag

```bash
# Locally
git tag -d v2.0.2

# Remotely
git push origin :refs/tags/v2.0.2
```

### Rollback a release

```bash
# Remove the tag
git tag -d v2.0.2

# Reset to previous commit
git reset --hard HEAD~1

# Force push (⚠️ be careful!)
git push origin main --force
```

## Best Practices

1. ✅ **Always use the release script** - it handles everything correctly
2. ✅ **Write meaningful release notes** - they help track changes
3. ✅ **Test before releasing** - run `npm run build` locally first
4. ✅ **Use semantic versioning** - MAJOR.MINOR.PATCH
5. ✅ **Tag releases consistently** - always use `v` prefix (v2.0.1)
6. ✅ **Keep version.json in git** - it's needed for Docker builds

## Semantic Versioning

Follow [SemVer](https://semver.org/):

- **MAJOR** (3.0.0): Breaking changes
- **MINOR** (2.1.0): New features (backward compatible)
- **PATCH** (2.0.2): Bug fixes (backward compatible)

Examples:
- Fixed a bug → `2.0.1` → `2.0.2` (patch)
- Added new feature → `2.0.1` → `2.1.0` (minor)
- Changed API/UI significantly → `2.0.1` → `3.0.0` (major)

## Continuous Deployment

After pushing to your repository:

```bash
# 1. Push code and tags
git push && git push --tags

# 2. Deploy to CapRover (automatically builds and deploys)
git push caprover main
```

The Docker build will:
1. Copy `version.json` from the repo
2. Run `npm run build` (which uses version.json)
3. Create production image
4. Deploy to your CapRover instance

Users will see the new version within seconds (if not recording) or when they stop recording.

