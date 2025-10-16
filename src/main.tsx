import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Track if an update is waiting to be applied
let updateWaiting = false;

// Check if a recording session is active
function isRecordingActive(): boolean {
  // Check localStorage for active session indicator
  const isRecording = sessionStorage.getItem('wrc_recording_active') === 'true';
  return isRecording;
}

// Apply pending update by reloading
function applyUpdate() {
  if (updateWaiting && !isRecordingActive()) {
    console.log('🔄 Applying update...');
    sessionStorage.removeItem('wrc_update_waiting');
    window.location.reload();
  }
}

// Service Worker registration with smart updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('✅ Service Worker registered');

        // Check for updates immediately
        registration.update();

        // Check for updates every 60 seconds
        setInterval(() => {
          console.log('🔄 Checking for updates...');
          registration.update();
        }, 60000);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          console.log('📦 New version found, installing...');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('✅ New version activated!');
              
              if (navigator.serviceWorker.controller) {
                updateWaiting = true;
                sessionStorage.setItem('wrc_update_waiting', 'true');
                
                if (isRecordingActive()) {
                  console.log('⏸️ Update ready, but waiting for session to end...');
                  console.log('💡 Update will apply when you stop recording');
                } else {
                  console.log('🔄 No active session, applying update now...');
                  applyUpdate();
                }
              }
            }
          });
        });

        // Handle controller change (new SW took over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!isRecordingActive()) {
            console.log('🔄 Controller changed, reloading...');
            window.location.reload();
          }
        });

        // Check periodically if we can apply a waiting update
        setInterval(() => {
          if (updateWaiting && !isRecordingActive()) {
            console.log('✅ Session ended, applying pending update...');
            applyUpdate();
          }
        }, 5000); // Check every 5 seconds
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}

// Make applyUpdate available globally for manual triggering
(window as any).applyPendingUpdate = applyUpdate;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

