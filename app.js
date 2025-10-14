// WRC Coach - Wilhelmsburger Ruder Club
// Progressive Web App for Rowing Performance
// Main Application Logic

class StrokeCoach {
    constructor() {
        // State
        this.running = false;
        this.calibrated = false;
        this.sessionStartTime = null;
        this.samples = [];
        this.strokeData = [];
        this.strokeHistory = []; // Store complete strokes for history display
        
        // Calibration
        this.offset = { x: 0, y: 0, z: 0 }; // meters
        this.calibrationMatrix = null;
        this.gravityRef = { x: 0, y: 0, z: 9.81 };
        
        // Settings (with defaults)
        this.settings = {
            historyStrokes: 2,
            trailOpacity: 40,
            catchThreshold: 0.6,
            finishThreshold: -0.3,
            sampleRate: 20,
            demoMode: false
        };
        
        // Demo mode state
        this.demoIntervalId = null;
        this.demoGPSIntervalId = null;
        this.demoStartTime = null;
        this.demoStrokePhase = 0; // 0 = recovery, 1 = drive
        
        // Stroke detection
        this.inDrive = false;
        this.catchTime = null;
        this.finishTime = null;
        this.strokeCount = 0;
        this.lastStrokeRate = 0;
        this.lastDrivePercent = 0;
        
        // Filters
        this.hpFilter = this.createHighPassFilter(0.995);
        this.recoveryWindow = [];
        this.recoveryWindowMs = 3000;
        
        // GPS
        this.gpsWatchId = null;
        this.lastGPS = null;
        
        // Canvas contexts
        this.polarCanvas = document.getElementById('polarCanvas');
        this.stabilityCanvas = document.getElementById('stabilityCanvas');
        this.polarCtx = this.polarCanvas.getContext('2d');
        this.stabilityCtx = this.stabilityCanvas.getContext('2d');
        
        // UI elements
        this.elements = {
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            exportBtn: document.getElementById('exportBtn'),
            calibrateBtn: document.getElementById('calibrateBtn'),
            statusText: document.getElementById('statusText'),
            statusDot: document.getElementById('statusDot'),
            strokeRate: document.getElementById('strokeRate'),
            drivePercent: document.getElementById('drivePercent'),
            boatSpeed: document.getElementById('boatSpeed'),
            sampleCount: document.getElementById('sampleCount'),
            modal: document.getElementById('calibrationModal'),
            offsetX: document.getElementById('offsetX'),
            offsetY: document.getElementById('offsetY'),
            offsetXValue: document.getElementById('offsetXValue'),
            offsetYValue: document.getElementById('offsetYValue'),
            toast: document.getElementById('toast'),
            // Settings panel
            menuBtn: document.getElementById('menuBtn'),
            settingsPanel: document.getElementById('settingsPanel'),
            settingsOverlay: document.getElementById('settingsOverlay'),
            closeSettings: document.getElementById('closeSettings'),
            historyStrokes: document.getElementById('historyStrokes'),
            historyStrokesValue: document.getElementById('historyStrokesValue'),
            trailOpacity: document.getElementById('trailOpacity'),
            trailOpacityValue: document.getElementById('trailOpacityValue'),
            catchThreshold: document.getElementById('catchThreshold'),
            catchThresholdValue: document.getElementById('catchThresholdValue'),
            finishThreshold: document.getElementById('finishThreshold'),
            finishThresholdValue: document.getElementById('finishThresholdValue'),
            sampleRate: document.getElementById('sampleRate'),
            sampleRateValue: document.getElementById('sampleRateValue'),
            demoMode: document.getElementById('demoMode'),
            resetSettings: document.getElementById('resetSettings')
        };
        
        // Load settings from localStorage first
        this.loadSettings();
        
        this.initializeCanvases();
        this.attachEventListeners();
        this.drawInitialCharts();
        
        // Request wake lock on supported devices
        this.wakeLock = null;
        this.requestWakeLock();
    }
    
    // Initialize canvas sizes
    initializeCanvases() {
        const resizeCanvas = (canvas, aspectRatio) => {
            // Use requestAnimationFrame to avoid forced reflow
            requestAnimationFrame(() => {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = (rect.width / aspectRatio) * dpr;
                const ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr);
            });
        };
        
        resizeCanvas(this.polarCanvas, 1); // Square
        resizeCanvas(this.stabilityCanvas, 4); // Wide
        
        // Debounce resize events
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                resizeCanvas(this.polarCanvas, 1);
                resizeCanvas(this.stabilityCanvas, 4);
                // Delay drawing until resize is complete
                requestAnimationFrame(() => {
                    this.drawPolarPlot();
                    this.drawStabilityPlot();
                });
            }, 100);
        });
    }
    
    // Event listeners
    attachEventListeners() {
        // Main controls
        if (this.elements.calibrateBtn) {
            this.elements.calibrateBtn.addEventListener('click', () => this.showCalibrationModal());
        }
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => this.startSession());
        }
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopSession());
        }
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.exportData());
        }
        
        // Calibration modal
        const cancelBtn = document.getElementById('cancelCalibration');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.elements.modal.classList.remove('active');
            });
        }
        
        const confirmBtn = document.getElementById('confirmCalibration');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.performCalibration();
            });
        }
        
        if (this.elements.offsetX) {
            this.elements.offsetX.addEventListener('input', (e) => {
                this.elements.offsetXValue.textContent = `${e.target.value} cm`;
            });
        }
        
        if (this.elements.offsetY) {
            this.elements.offsetY.addEventListener('input', (e) => {
                this.elements.offsetYValue.textContent = `${e.target.value} cm`;
            });
        }
        
        // Settings panel
        if (this.elements.menuBtn) {
            this.elements.menuBtn.addEventListener('click', () => this.openSettings());
        }
        if (this.elements.closeSettings) {
            this.elements.closeSettings.addEventListener('click', () => this.closeSettings());
        }
        if (this.elements.settingsOverlay) {
            this.elements.settingsOverlay.addEventListener('click', () => this.closeSettings());
        }
        
        // Settings controls
        if (this.elements.historyStrokes) {
            this.elements.historyStrokes.addEventListener('input', (e) => {
                this.settings.historyStrokes = parseInt(e.target.value);
                this.elements.historyStrokesValue.textContent = e.target.value;
                this.saveSettings();
            });
        }
        
        if (this.elements.trailOpacity) {
            this.elements.trailOpacity.addEventListener('input', (e) => {
                this.settings.trailOpacity = parseInt(e.target.value);
                this.elements.trailOpacityValue.textContent = `${e.target.value}%`;
                this.saveSettings();
            });
        }
        
        if (this.elements.catchThreshold) {
            this.elements.catchThreshold.addEventListener('input', (e) => {
                this.settings.catchThreshold = parseFloat(e.target.value);
                this.elements.catchThresholdValue.textContent = `${e.target.value} m/s²`;
                this.saveSettings();
            });
        }
        
        if (this.elements.finishThreshold) {
            this.elements.finishThreshold.addEventListener('input', (e) => {
                this.settings.finishThreshold = parseFloat(e.target.value);
                this.elements.finishThresholdValue.textContent = `${e.target.value} m/s²`;
                this.saveSettings();
            });
        }
        
        if (this.elements.sampleRate) {
            this.elements.sampleRate.addEventListener('input', (e) => {
                this.settings.sampleRate = parseInt(e.target.value);
                this.elements.sampleRateValue.textContent = `${e.target.value} FPS`;
                this.saveSettings();
            });
        }
        
        if (this.elements.demoMode) {
            this.elements.demoMode.addEventListener('change', (e) => {
                this.settings.demoMode = e.target.checked;
                this.saveSettings();
                this.showToast(e.target.checked ? 'Demo mode enabled' : 'Demo mode disabled');
            });
        }
        
        if (this.elements.resetSettings) {
            this.elements.resetSettings.addEventListener('click', () => {
                this.resetSettings();
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Toggle settings with 'S' key (when not typing in input)
            if (e.key === 's' || e.key === 'S') {
                if (document.activeElement.tagName !== 'INPUT' && 
                    document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    if (this.elements.settingsPanel && 
                        this.elements.settingsPanel.classList.contains('open')) {
                        this.closeSettings();
                    } else {
                        this.openSettings();
                    }
                }
            }
            
            // Close settings with ESC key
            if (e.key === 'Escape') {
                if (this.elements.settingsPanel && 
                    this.elements.settingsPanel.classList.contains('open')) {
                    this.closeSettings();
                }
            }
        });
    }
    
    // Load settings from localStorage
    loadSettings() {
        const saved = localStorage.getItem('strokeCoachSettings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            } catch (e) {
                console.warn('Failed to load settings:', e);
            }
        }
        this.applySettingsToUI();
    }
    
    // Save settings to localStorage
    saveSettings() {
        localStorage.setItem('strokeCoachSettings', JSON.stringify(this.settings));
    }
    
    // Apply settings to UI controls
    applySettingsToUI() {
        if (this.elements.historyStrokes) {
            this.elements.historyStrokes.value = this.settings.historyStrokes;
        }
        if (this.elements.historyStrokesValue) {
            this.elements.historyStrokesValue.textContent = this.settings.historyStrokes;
        }
        
        if (this.elements.trailOpacity) {
            this.elements.trailOpacity.value = this.settings.trailOpacity;
        }
        if (this.elements.trailOpacityValue) {
            this.elements.trailOpacityValue.textContent = `${this.settings.trailOpacity}%`;
        }
        
        if (this.elements.catchThreshold) {
            this.elements.catchThreshold.value = this.settings.catchThreshold;
        }
        if (this.elements.catchThresholdValue) {
            this.elements.catchThresholdValue.textContent = `${this.settings.catchThreshold} m/s²`;
        }
        
        if (this.elements.finishThreshold) {
            this.elements.finishThreshold.value = this.settings.finishThreshold;
        }
        if (this.elements.finishThresholdValue) {
            this.elements.finishThresholdValue.textContent = `${this.settings.finishThreshold} m/s²`;
        }
        
        if (this.elements.sampleRate) {
            this.elements.sampleRate.value = this.settings.sampleRate;
        }
        if (this.elements.sampleRateValue) {
            this.elements.sampleRateValue.textContent = `${this.settings.sampleRate} FPS`;
        }
        
        if (this.elements.demoMode) {
            this.elements.demoMode.checked = this.settings.demoMode;
        }
    }
    
    // Reset settings to defaults
    resetSettings() {
        this.settings = {
            historyStrokes: 2,
            trailOpacity: 40,
            catchThreshold: 0.6,
            finishThreshold: -0.3,
            sampleRate: 20,
            demoMode: false
        };
        this.saveSettings();
        this.applySettingsToUI();
        this.showToast('Settings reset to defaults');
    }
    
    // Open settings panel
    openSettings() {
        if (this.elements.settingsPanel) {
            this.elements.settingsPanel.classList.add('open');
        }
        if (this.elements.settingsOverlay) {
            this.elements.settingsOverlay.classList.add('show');
        }
        if (this.elements.menuBtn) {
            this.elements.menuBtn.classList.add('active');
        }
    }
    
    // Close settings panel
    closeSettings() {
        if (this.elements.settingsPanel) {
            this.elements.settingsPanel.classList.remove('open');
        }
        if (this.elements.settingsOverlay) {
            this.elements.settingsOverlay.classList.remove('show');
        }
        if (this.elements.menuBtn) {
            this.elements.menuBtn.classList.remove('active');
        }
    }
    
    // High-pass filter factory
    createHighPassFilter(alpha = 0.995) {
        let y = 0, xPrev = 0;
        return (x) => {
            const yNew = alpha * (y + x - xPrev);
            xPrev = x;
            y = yNew;
            return yNew;
        };
    }
    
    // Show calibration modal
    showCalibrationModal() {
        this.elements.modal.classList.add('active');
    }
    
    // Perform calibration
    async performCalibration() {
        this.elements.modal.classList.remove('active');
        this.showToast('Calibrating... Hold steady for 2 seconds');
        
        // Get offsets
        this.offset.x = parseFloat(this.elements.offsetX.value) / 100; // cm to m
        this.offset.y = parseFloat(this.elements.offsetY.value) / 100;
        
        // Sample gravity for 2 seconds
        const samples = [];
        const sampleDuration = 2000;
        const startTime = Date.now();
        
        const handler = (event) => {
            if (Date.now() - startTime < sampleDuration) {
                const a = event.accelerationIncludingGravity;
                if (a && a.x !== null && a.y !== null && a.z !== null) {
                    samples.push({ x: a.x, y: a.y, z: a.z });
                }
            }
        };
        
        window.addEventListener('devicemotion', handler);
        
        await new Promise(resolve => setTimeout(resolve, sampleDuration));
        window.removeEventListener('devicemotion', handler);
        
        if (samples.length > 10) {
            // Average gravity
            const avg = samples.reduce((acc, s) => ({
                x: acc.x + s.x / samples.length,
                y: acc.y + s.y / samples.length,
                z: acc.z + s.z / samples.length
            }), { x: 0, y: 0, z: 0 });
            
            this.gravityRef = avg;
            this.calibrated = true;
            this.showToast(`Calibration complete! (${samples.length} samples)`);
        } else {
            this.showToast('Calibration failed - not enough samples', true);
        }
    }
    
    // Request permissions and start session
    async startSession() {
        try {
            // Start sensors
            this.sessionStartTime = Date.now();
            this.running = true;
            this.samples = [];
            this.strokeData = [];
            this.strokeCount = 0;
            
            if (this.settings.demoMode) {
                // Start demo mode
                this.startDemoMode();
                this.showToast('Demo session started (25 SPM)');
            } else {
                // Request motion permissions (iOS)
                if (typeof DeviceMotionEvent !== 'undefined' &&
                    typeof DeviceMotionEvent.requestPermission === 'function') {
                    const response = await DeviceMotionEvent.requestPermission();
                    if (response !== 'granted') {
                        throw new Error('Motion permission denied');
                    }
                }
                
                // Start IMU
                window.addEventListener('devicemotion', this.onMotion.bind(this));
                
                // Start GPS
                this.gpsWatchId = navigator.geolocation.watchPosition(
                    this.onGPS.bind(this),
                    (error) => console.warn('GPS error:', error),
                    {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 10000
                    }
                );
                
                this.showToast('Session started');
            }
            
            // Update UI
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.elements.exportBtn.disabled = true;
            this.elements.calibrateBtn.disabled = true;
            this.elements.statusDot.classList.add('active');
            this.elements.statusText.textContent = this.settings.demoMode ? 'Demo Mode' : 'Recording';
            
            // Start render loop
            this.renderLoop();
            
        } catch (error) {
            this.showToast(`Error: ${error.message}`, true);
            console.error(error);
        }
    }
    
    // Stop session
    stopSession() {
        this.running = false;
        
        // Stop sensors
        window.removeEventListener('devicemotion', this.onMotion);
        if (this.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        
        // Stop demo mode
        this.stopDemoMode();
        
        // Update UI
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.elements.exportBtn.disabled = false;
        this.elements.calibrateBtn.disabled = false;
        this.elements.statusDot.classList.remove('active');
        this.elements.statusText.textContent = 'Stopped';
        
        this.showToast(`Session stopped (${this.samples.length} samples)`);
    }
    
    // Start demo mode simulation
    startDemoMode() {
        this.demoStartTime = performance.now();
        this.demoStrokePhase = 0;
        
        // Simulate IMU at 50 Hz (20ms intervals)
        this.demoIntervalId = setInterval(() => {
            if (!this.running) return;
            
            const t = performance.now();
            const elapsed = t - this.demoStartTime;
            
            // 25 SPM = 2400ms per stroke
            const strokeCycle = 2400; // ms
            const driveTime = 840; // 35% of cycle
            const recoveryTime = 1560; // 65% of cycle
            
            // Determine position in current stroke cycle
            const cyclePosition = elapsed % strokeCycle;
            const inDrive = cyclePosition < driveTime;
            
            // Generate realistic acceleration pattern
            let ay; // fore-aft acceleration (m/s²)
            if (inDrive) {
                // Drive phase: strong positive acceleration, peaks mid-drive
                const drivePhase = cyclePosition / driveTime;
                // Sine wave with peak at ~40% through drive
                ay = Math.sin(drivePhase * Math.PI) * 2.2 + Math.random() * 0.15 - 0.075;
            } else {
                // Recovery phase: slight negative then settling to near zero
                const recoveryPhase = (cyclePosition - driveTime) / recoveryTime;
                // Exponential decay from negative to ~0
                ay = -0.5 * Math.exp(-recoveryPhase * 3) + Math.random() * 0.1 - 0.05;
            }
            
            // Simulate realistic roll through stroke cycle
            // Slight tilt to starboard during drive (positive ax), port during recovery (negative ax)
            let ax;
            if (inDrive) {
                // During drive: slight starboard tilt (positive roll)
                const drivePhase = cyclePosition / driveTime;
                ax = Math.sin(drivePhase * Math.PI) * 1.5 + Math.random() * 0.2 - 0.1;
            } else {
                // During recovery: slight port tilt (negative roll)
                const recoveryPhase = (cyclePosition - driveTime) / recoveryTime;
                ax = -Math.sin(recoveryPhase * Math.PI * 0.5) * 0.8 + Math.random() * 0.2 - 0.1;
            }
            
            // Vertical acceleration (relatively constant)
            const az = 9.5 + Math.random() * 0.3 - 0.15;
            
            // Simulate rotation rates (degrees/s)
            const gx = Math.random() * 2 - 1; // roll rate
            const gy = Math.random() * 1.5 - 0.75; // pitch rate
            const gz = Math.random() * 1 - 0.5; // yaw rate
            
            // Create sample in same format as real sensor
            const sample = {
                t,
                type: 'imu',
                ax, ay, az,
                gx, gy, gz
            };
            
            this.samples.push(sample);
            this.processIMUSample(sample);
            
        }, 20); // 50 Hz
        
        // Simulate GPS updates at 1 Hz
        this.demoGPSIntervalId = setInterval(() => {
            if (!this.running) return;
            
            const t = performance.now();
            const elapsed = t - this.demoStartTime;
            
            // 2:10 min/500m = 130 seconds for 500m = 3.846 m/s
            // Add small noise to simulate GPS variance
            const baseSpeed = 3.846; // m/s for 2:10 split
            const speed = baseSpeed + (Math.random() * 0.1 - 0.05); // ±0.05 m/s noise
            
            // Fake position (doesn't matter for display, but realistic)
            const lat = 47.6097 + (elapsed / 1000) * 0.00001;
            const lon = -122.3331 + (elapsed / 1000) * 0.00001;
            
            const gpsData = {
                t,
                type: 'gps',
                lat,
                lon,
                speed,
                heading: 90, // arbitrary
                accuracy: 5
            };
            
            this.lastGPS = gpsData;
            this.samples.push(gpsData);
            
        }, 1000); // 1 Hz
    }
    
    // Stop demo mode simulation
    stopDemoMode() {
        if (this.demoIntervalId) {
            clearInterval(this.demoIntervalId);
            this.demoIntervalId = null;
        }
        if (this.demoGPSIntervalId) {
            clearInterval(this.demoGPSIntervalId);
            this.demoGPSIntervalId = null;
        }
    }
    
    // Handle motion events
    onMotion(event) {
        if (!this.running) return;
        
        const t = performance.now();
        
        // Get acceleration
        const a = event.acceleration || event.accelerationIncludingGravity;
        const g = event.rotationRate;
        
        if (!a || a.x === null) return;
        
        const ax = a.x || 0;
        const ay = a.y || 0;
        const az = a.z || 0;
        const gx = g ? (g.alpha || 0) : 0;
        const gy = g ? (g.beta || 0) : 0;
        const gz = g ? (g.gamma || 0) : 0;
        
        // Store raw sample
        const sample = {
            t,
            type: 'imu',
            ax, ay, az,
            gx, gy, gz
        };
        
        this.samples.push(sample);
        
        // Process for real-time display
        this.processIMUSample(sample);
    }
    
    // Handle GPS updates
    onGPS(position) {
        if (!this.running) return;
        
        const t = position.timestamp;
        const { latitude, longitude, speed, heading, accuracy } = position.coords;
        
        this.lastGPS = {
            t,
            type: 'gps',
            lat: latitude,
            lon: longitude,
            speed: speed || 0,
            heading: heading || 0,
            accuracy: accuracy || 0
        };
        
        this.samples.push(this.lastGPS);
    }
    
    // Process IMU sample for stroke detection
    processIMUSample(sample) {
        // Use phone X-axis as surge (adjust based on orientation)
        // In typical phone orientation (screen up, top to bow), X is left-right, Y is fore-aft
        const surge = sample.ay; // Adjust based on actual orientation
        
        // Apply high-pass filter
        const surgeHP = this.hpFilter(surge);
        
        // Use configurable thresholds
        const catchThreshold = this.settings.catchThreshold;
        const finishThreshold = this.settings.finishThreshold;
        
        // Detect catch (start of drive)
        if (!this.inDrive && surgeHP > catchThreshold) {
            this.inDrive = true;
            this.catchTime = sample.t;
            this.strokeCount++;
            
            // Start collecting new stroke samples
            this.currentStrokeSamples = [];
        }
        // Detect finish (end of drive)
        else if (this.inDrive && surgeHP < finishThreshold) {
            this.inDrive = false;
            this.finishTime = sample.t;
            
            // Calculate stroke metrics
            if (this.catchTime !== null) {
                const driveTime = this.finishTime - this.catchTime;
                const lastStrokeData = this.strokeData[this.strokeData.length - 1];
                const recoveryTime = lastStrokeData ? (this.catchTime - lastStrokeData.finishTime) : 0;
                const totalTime = driveTime + recoveryTime;
                
                if (totalTime > 0) {
                    this.lastStrokeRate = Math.round(60000 / totalTime);
                    this.lastDrivePercent = Math.round((driveTime / totalTime) * 100);
                }
                
                const strokeInfo = {
                    catchTime: this.catchTime,
                    finishTime: this.finishTime,
                    driveTime,
                    recoveryTime
                };
                
                this.strokeData.push(strokeInfo);
                
                // Save completed stroke for history
                if (this.currentStrokeSamples && this.currentStrokeSamples.length > 0) {
                    this.strokeHistory.push({
                        ...strokeInfo,
                        samples: [...this.currentStrokeSamples]
                    });
                    
                    // Keep only last N strokes
                    const maxHistory = this.settings.historyStrokes + 1; // +1 for current
                    if (this.strokeHistory.length > maxHistory) {
                        this.strokeHistory.shift();
                    }
                }
            }
        }
        
        // Collect samples for current stroke
        if (this.currentStrokeSamples) {
            this.currentStrokeSamples.push({
                t: sample.t,
                surgeHP: surgeHP,
                inDrive: this.inDrive,
                angle: this.getStrokeAngle(sample.t)
            });
        }
        
        // Update recovery baseline
        this.updateRecoveryBaseline(sample.t, surgeHP);
        
        // Store processed data
        sample.surgeHP = surgeHP;
        sample.inDrive = this.inDrive;
        sample.strokeAngle = this.getStrokeAngle(sample.t);
        sample.roll = this.getRoll(sample);
    }
    
    // Update recovery baseline (for drag compensation)
    updateRecoveryBaseline(t, value) {
        if (!this.inDrive) {
            this.recoveryWindow.push({ t, v: value });
        }
        
        // Remove old samples
        while (this.recoveryWindow.length > 0 && 
               t - this.recoveryWindow[0].t > this.recoveryWindowMs) {
            this.recoveryWindow.shift();
        }
    }
    
    // Get baseline-corrected acceleration
    getBaselineCorrected(value) {
        if (this.recoveryWindow.length < 10) return value;
        
        const avg = this.recoveryWindow.reduce((sum, p) => sum + p.v, 0) / this.recoveryWindow.length;
        return value - avg;
    }
    
    // Calculate stroke angle (0-360°) based on actual drive ratio
    getStrokeAngle(t) {
        if (this.catchTime === null) return 0;
        
        // Use measured drive% or default to 35% (1:1.86 ratio - good technique)
        const drivePercent = this.lastDrivePercent > 0 ? this.lastDrivePercent / 100 : 0.35;
        const driveAngle = 360 * drivePercent;
        const recoveryAngle = 360 * (1 - drivePercent);
        
        if (this.inDrive) {
            // Drive phase: 0° to driveAngle (e.g., 126° for 35%)
            const driveTime = t - this.catchTime;
            const estimatedDriveTime = 700; // ms, adjust based on stroke rate
            const phase = Math.min(driveTime / estimatedDriveTime, 1);
            return phase * driveAngle;
        } else {
            // Recovery phase: driveAngle to 360°
            if (this.finishTime === null) return driveAngle;
            const recoveryTime = t - this.finishTime;
            const estimatedRecoveryTime = 1400; // ms
            const phase = Math.min(recoveryTime / estimatedRecoveryTime, 1);
            return driveAngle + phase * recoveryAngle;
        }
    }
    
    // Calculate roll from gravity
    getRoll(sample) {
        // Simple roll estimation from accelerometer
        // Assumes phone is flat (screen up)
        const roll = Math.atan2(sample.ax, Math.sqrt(sample.ay * sample.ay + sample.az * sample.az));
        return roll * (180 / Math.PI); // Convert to degrees
    }
    
    // Convert m/s to min/500m split time
    convertToSplitTime(speedMS) {
        if (speedMS <= 0) return '--';
        
        // Time to row 500m in seconds
        const timeSeconds = 500 / speedMS;
        
        // Convert to minutes and seconds
        const minutes = Math.floor(timeSeconds / 60);
        const seconds = Math.floor(timeSeconds % 60);
        
        // Format as M:SS
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Render loop
    renderLoop() {
        if (!this.running) return;
        
        // Update metrics
        this.elements.strokeRate.textContent = this.lastStrokeRate || '--';
        this.elements.drivePercent.textContent = this.lastDrivePercent || '--';
        
        // Convert m/s to min/500m split time
        if (this.lastGPS && this.lastGPS.speed > 0.1) {
            const splitTime = this.convertToSplitTime(this.lastGPS.speed);
            this.elements.boatSpeed.textContent = splitTime;
        } else {
            this.elements.boatSpeed.textContent = '--';
        }
        
        this.elements.sampleCount.textContent = this.samples.length;
        
        // Update charts (throttle based on settings)
        const throttle = Math.ceil(100 / this.settings.sampleRate);
        if (this.samples.length % throttle === 0) {
            this.drawPolarPlot();
            this.drawStabilityPlot();
        }
        
        requestAnimationFrame(() => this.renderLoop());
    }
    
    // Draw polar plot
    drawPolarPlot() {
        // Safety check - ensure settings exist
        if (!this.settings) {
            console.warn('Settings not initialized yet');
            return;
        }
        
        const ctx = this.polarCtx;
        const canvas = this.polarCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.4;
        
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        // Draw background circles
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * (i / 4), 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Draw angle markers
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        
        // Dynamic finish angle based on drive%
        const drivePercent = this.lastDrivePercent > 0 ? this.lastDrivePercent / 100 : 0.35;
        const finishAngle = 360 * drivePercent;
        
        const angles = [0, finishAngle, 180, 270];
        angles.forEach(angle => {
            const rad = (angle - 90) * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(rad) * radius,
                centerY + Math.sin(rad) * radius
            );
            ctx.stroke();
        });
        
        // Draw labels
        ctx.fillStyle = 'rgba(203, 213, 225, 0.8)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Catch (0°)', centerX, centerY - radius - 10);
        
        // Dynamic finish label - positioned inside the graph for mobile visibility
        const finishRad = (finishAngle - 90) * Math.PI / 180;
        const labelDist = radius * 0.5; // Inside the circle
        const finishLabelX = centerX + Math.cos(finishRad) * labelDist;
        const finishLabelY = centerY + Math.sin(finishRad) * labelDist;
        
        // Draw label background for better readability
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        const labelText = `Finish (${Math.round(finishAngle)}°)`;
        const metrics = ctx.measureText(labelText);
        const padding = 4;
        ctx.fillRect(
            finishLabelX - metrics.width / 2 - padding,
            finishLabelY - 7 - padding,
            metrics.width + padding * 2,
            14 + padding * 2
        );
        
        ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
        ctx.fillText(labelText, finishLabelX, finishLabelY);
        
        // Draw historical strokes (fading)
        if (this.settings.historyStrokes > 0 && this.strokeHistory.length > 1) {
            const totalStrokes = Math.min(this.strokeHistory.length - 1, this.settings.historyStrokes);
            const baseOpacity = this.settings.trailOpacity / 100;
            
            for (let histIdx = 0; histIdx < totalStrokes; histIdx++) {
                const stroke = this.strokeHistory[histIdx];
                if (!stroke.samples || stroke.samples.length < 2) continue;
                
                // Calculate fade (older = more transparent)
                const age = totalStrokes - histIdx;
                const opacity = baseOpacity * (1 - (age / (totalStrokes + 1)));
                
                // Thicker lines for visibility
                ctx.lineWidth = 3.5;
                
                stroke.samples.forEach((sample, i) => {
                    if (i === 0) return;
                    
                    const prevSample = stroke.samples[i - 1];
                    
                    // Get baseline-corrected acceleration
                    const accel = this.getBaselineCorrected(sample.surgeHP);
                    const prevAccel = this.getBaselineCorrected(prevSample.surgeHP);
                    
                    // Map to radius
                    const scale = 50;
                    const r = Math.max(0, Math.min(radius, radius * 0.3 + accel * scale));
                    const prevR = Math.max(0, Math.min(radius, radius * 0.3 + prevAccel * scale));
                    
                    // Convert to cartesian
                    const rad = (sample.angle - 90) * Math.PI / 180;
                    const prevRad = (prevSample.angle - 90) * Math.PI / 180;
                    const x = centerX + Math.cos(rad) * r;
                    const y = centerY + Math.sin(rad) * r;
                    const prevX = centerX + Math.cos(prevRad) * prevR;
                    const prevY = centerY + Math.sin(prevRad) * prevR;
                    
                    // Color by phase with opacity
                    const driveColor = `rgba(59, 130, 246, ${opacity})`;
                    const recoveryColor = `rgba(139, 92, 246, ${opacity})`;
                    ctx.strokeStyle = sample.inDrive ? driveColor : recoveryColor;
                    
                    ctx.beginPath();
                    ctx.moveTo(prevX, prevY);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                });
            }
        }
        
        // Draw current stroke (full opacity)
        const recentSamples = this.samples
            .filter(s => s.type === 'imu' && s.surgeHP !== undefined)
            .slice(-200); // Last 200 samples
        
        if (recentSamples.length < 2) return;
        
        // Thicker lines for coxswain visibility
        ctx.lineWidth = 4;
        
        recentSamples.forEach((sample, i) => {
            if (i === 0) return;
            
            const prevSample = recentSamples[i - 1];
            const angle = sample.strokeAngle;
            const prevAngle = prevSample.strokeAngle;
            
            // Get baseline-corrected acceleration
            const accel = this.getBaselineCorrected(sample.surgeHP);
            const prevAccel = this.getBaselineCorrected(prevSample.surgeHP);
            
            // Map to radius (scale factor)
            const scale = 50;
            const r = Math.max(0, Math.min(radius, radius * 0.3 + accel * scale));
            const prevR = Math.max(0, Math.min(radius, radius * 0.3 + prevAccel * scale));
            
            // Convert to cartesian
            const rad = (angle - 90) * Math.PI / 180;
            const prevRad = (prevAngle - 90) * Math.PI / 180;
            const x = centerX + Math.cos(rad) * r;
            const y = centerY + Math.sin(rad) * r;
            const prevX = centerX + Math.cos(prevRad) * prevR;
            const prevY = centerY + Math.sin(prevRad) * prevR;
            
            // Color by phase (bright, full opacity for current stroke)
            ctx.strokeStyle = sample.inDrive ? 
                'rgba(59, 130, 246, 0.95)' : 'rgba(139, 92, 246, 0.95)';
            
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
            ctx.stroke();
        });
    }
    
    // Draw stability plot
    drawStabilityPlot() {
        const ctx = this.stabilityCtx;
        const canvas = this.stabilityCanvas;
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const centerY = height / 2;
        
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        // Draw center line
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        
        // Draw reference lines
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach(frac => {
            [frac, 1 - frac].forEach(y => {
                ctx.beginPath();
                ctx.moveTo(0, height * y);
                ctx.lineTo(width, height * y);
                ctx.stroke();
            });
        });
        
        // Draw finish line marker (dynamic based on drive%)
        const drivePercent = this.lastDrivePercent > 0 ? this.lastDrivePercent / 100 : 0.35;
        const finishX = width * drivePercent;
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(finishX, 0);
        ctx.lineTo(finishX, height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Get samples for current stroke cycle (based on stroke angle)
        let strokeSamples = this.samples
            .filter(s => s.type === 'imu' && s.roll !== undefined && s.strokeAngle !== undefined)
            .slice(-200);
        
        if (strokeSamples.length < 2) return;
        
        // Group samples by stroke cycle to ensure continuity
        // Find samples near 0° (catch) to duplicate at 360° for seamless wrapping
        const catchSamples = strokeSamples.filter(s => s.strokeAngle < 20);
        if (catchSamples.length > 0) {
            // Duplicate the first catch sample at 360° to close the loop
            const firstCatch = catchSamples[0];
            const duplicated = {
                ...firstCatch,
                strokeAngle: 360,
                _isDuplicate: true
            };
            strokeSamples = [...strokeSamples, duplicated];
            // Sort by angle to maintain proper order
            strokeSamples.sort((a, b) => a.strokeAngle - b.strokeAngle);
        }
        
        // Draw roll trace mapped to stroke angle
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        let firstPoint = true;
        let prevAngle = null;
        
        strokeSamples.forEach((sample, i) => {
            // Map stroke angle (0-360°) to x position
            const angle = sample.strokeAngle || 0;
            const x = (angle / 360) * width;
            
            const rollDeg = sample.roll || 0;
            // Scale: ±10° to full height
            const y = centerY - (rollDeg / 10) * (height * 0.4);
            
            // Detect discontinuity: large jump in angle indicates wrap-around
            const isDiscontinuous = prevAngle !== null && Math.abs(angle - prevAngle) > 100;
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else if (isDiscontinuous) {
                // Don't draw line across discontinuity, but continue path
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            prevAngle = angle;
        });
        ctx.stroke();
        
        // Draw labels
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Port', 5, 15);
        
        ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.textAlign = 'right';
        ctx.fillText('Starboard', width - 5, height - 5);
        
        // Draw catch/finish labels at bottom
        ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Catch', 5, height - 5);
        
        ctx.textAlign = 'center';
        ctx.fillText('Finish', finishX, height - 5);
        
        ctx.textAlign = 'right';
        ctx.fillText('Catch', width - 5, height - 5);
    }
    
    // Draw initial empty charts
    drawInitialCharts() {
        this.drawPolarPlot();
        this.drawStabilityPlot();
    }
    
    // Export data as CSV
    exportData() {
        if (this.samples.length === 0) {
            this.showToast('No data to export', true);
            return;
        }
        
        // Generate CSV
        const headers = 't,type,ax,ay,az,gx,gy,gz,lat,lon,speed,heading,accuracy\n';
        const rows = this.samples.map(s => {
            if (s.type === 'imu') {
                return `${s.t},imu,${s.ax},${s.ay},${s.az},${s.gx},${s.gy},${s.gz},,,,,,`;
            } else {
                return `${s.t},gps,,,,,,,,${s.lat},${s.lon},${s.speed},${s.heading},${s.accuracy}`;
            }
        }).join('\n');
        
        const csv = headers + rows;
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stroke_coach_${new Date().toISOString()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast(`Exported ${this.samples.length} samples`);
    }
    
    // Show toast notification
    showToast(message, isError = false) {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.style.background = isError ? 
            'linear-gradient(135deg, #ef4444, #dc2626)' : 
            'rgba(51, 65, 85, 0.95)';
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    // Request wake lock
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                // console.debug('Wake lock acquired');
            }
        } catch (error) {
            // Silent fail - wake lock is optional
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new StrokeCoach();
    });
} else {
    window.app = new StrokeCoach();
}

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.warn('Service Worker registration failed:', err));
    });
}

