import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

// Get git version info
function getGitVersion() {
  try {
    const gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    
    // Try to get the most recent tag
    let gitTag = '';
    try {
      gitTag = execSync('git describe --tags --abbrev=0').toString().trim();
    } catch {
      // No tags found
      gitTag = '';
    }
    
    // Check if there are uncommitted changes
    const gitDirty = execSync('git status --porcelain').toString().trim() !== '';
    
    return {
      commit: gitCommit,
      branch: gitBranch,
      tag: gitTag,
      dirty: gitDirty,
    };
  } catch (error) {
    console.warn('Could not get git version info:', error);
    return {
      commit: 'unknown',
      branch: 'unknown',
      tag: '',
      dirty: false,
    };
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // We'll register manually for better control
      includeAssets: ['wrc-logo.jpg', 'favicon.svg', 'icon.svg'],
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'WRC Coach - Wilhelmsburger Ruder Club',
        short_name: 'WRC Coach',
        description: 'Real-time rowing performance feedback using smartphone sensors',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,jpg,png,woff,woff2}'],
        // Clean old caches on activation
        cleanupOutdatedCaches: true,
        // Skip waiting - activate new SW immediately
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __GIT_COMMIT__: JSON.stringify(getGitVersion().commit),
    __GIT_BRANCH__: JSON.stringify(getGitVersion().branch),
    __GIT_TAG__: JSON.stringify(getGitVersion().tag),
    __GIT_DIRTY__: JSON.stringify(getGitVersion().dirty),
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});

