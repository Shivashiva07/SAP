(() => {
  const readerEl = document.getElementById('reader');
  const overlayEl = document.getElementById('overlay');
  const overlayIconEl = document.getElementById('overlay-icon');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlaySubtitleEl = document.getElementById('overlay-subtitle');
  const hintEl = document.getElementById('hint');
  const statusLineEl = document.getElementById('status-line');
  const countValueEl = document.getElementById('count-value');
  const portalNameEl = document.getElementById('portal-name');
  const cameraSelectEl = document.getElementById('camera-select');

  const LAST_CAMERA_KEY = 'qr-attendance-last-camera-id';

  const OVERLAY_MS = 1600;
  let busy = false; // true while an overlay is showing / a request is in flight

  // ── Sound feedback (no audio files needed) ──
  let audioCtx = null;
  function beep(freq, durationMs) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      // Audio not available (e.g. autoplay policy before first user gesture) — ignore.
    }
  }
  const sounds = {
    success: () => beep(880, 180),
    duplicate: () => beep(520, 180),
    error: () => { beep(220, 150); setTimeout(() => beep(180, 180), 160); },
  };

  function showOverlay(kind, icon, title, subtitle) {
    overlayEl.className = `overlay ${kind}`;
    overlayIconEl.textContent = icon;
    overlayTitleEl.textContent = title;
    overlaySubtitleEl.textContent = subtitle || '';
    overlayEl.hidden = false;
    hintEl.hidden = true;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
    hintEl.hidden = false;
  }

  function setCount(n) {
    if (typeof n === 'number') countValueEl.textContent = String(n);
  }

  async function refreshCount() {
    try {
      const res = await fetch('/api/count');
      if (res.ok) {
        const data = await res.json();
        setCount(data.count);
      }
    } catch (e) {
      // ignore — non-critical
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.portalName) {
          portalNameEl.textContent = data.portalName;
          document.title = data.portalName;
        }
      }
    } catch (e) {
      // keep defaults
    }
  }

  async function handleDecodedText(rawText) {
    if (busy) return;
    busy = true;

    const parsed = window.parseQrPayload(rawText);
    if (!parsed) {
      sounds.error();
      showOverlay('error', '✕', 'Invalid QR', 'This code is not a recognized student ID.');
      setTimeout(() => { hideOverlay(); busy = false; }, OVERLAY_MS);
      return;
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: rawText }),
      });
      const data = await res.json();

      if (data.status === 'success') {
        sounds.success();
        showOverlay('success', '✓', data.name || data.studentId, 'Marked present');
        setCount(data.count);
      } else if (data.status === 'duplicate') {
        sounds.duplicate();
        showOverlay('duplicate', '●', data.name || data.studentId, 'Already marked present today');
      } else {
        sounds.error();
        showOverlay('error', '✕', 'Invalid QR', data.message || 'Could not read this code.');
      }
    } catch (e) {
      sounds.error();
      showOverlay('error', '✕', 'Connection error', 'Could not reach the server.');
    } finally {
      setTimeout(() => { hideOverlay(); busy = false; }, OVERLAY_MS);
    }
  }

  let lastFailureLog = 0;
  function onScanFailure(errorMessage) {
    // Fires continuously while no QR is in frame — expected, not an error.
    // Throttled debug logging to help diagnose "camera sees it but won't
    // decode" cases without flooding the console at ~10 calls/sec.
    const now = Date.now();
    if (now - lastFailureLog > 1000) {
      lastFailureLog = now;
      console.warn('[scan-attempt]', errorMessage);
    }
  }

  let html5QrCode = null;
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    // Prefer the browser's native, hardware-accelerated barcode detector
    // (Chrome/Edge) over the bundled JS decoder — it's noticeably more
    // tolerant of compression artifacts from relayed/virtual webcam feeds.
    // Falls back to the JS decoder automatically where unsupported.
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    // Many virtual/external webcams (e.g. a phone used as a PC camera)
    // default to a low capture resolution unless a higher one is
    // explicitly requested, which blurs dense QR codes past the point
    // the decoder can find finder patterns. Ask for HD; the browser will
    // fall back to the closest resolution the device actually supports.
    videoConstraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };

  async function startWithSource(cameraIdOrConstraints) {
    if (html5QrCode.isScanning) {
      await html5QrCode.stop();
    }
    await html5QrCode.start(
      cameraIdOrConstraints,
      config,
      (decodedText) => handleDecodedText(decodedText),
      onScanFailure
    );

    // Debug: report the resolution the camera driver actually delivered,
    // vs. the 1920x1080 we asked for — many virtual webcam drivers ignore
    // requested constraints and silently cap out much lower.
    const videoEl = document.querySelector('#reader video');
    if (videoEl) {
      const track = videoEl.srcObject && videoEl.srcObject.getVideoTracks()[0];
      const settings = track && track.getSettings ? track.getSettings() : null;
      console.warn('[camera-actual-resolution]', settings);
    }
  }

  async function startScanner() {
    html5QrCode = new Html5Qrcode('reader');

    try {
      // Enumerate real camera devices first. On desktop, this is the only
      // reliable way to target an external/virtual webcam (e.g. a phone
      // used as a PC camera via DroidCam/Iriun/EpocCam/etc.) — facingMode
      // hints like 'environment' are meant for phone/tablet cameras and
      // are ignored or unpredictable on those devices.
      const devices = await Html5Qrcode.getCameras();

      if (devices && devices.length) {
        cameraSelectEl.innerHTML = '';
        devices.forEach((d) => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.label || `Camera ${d.id}`;
          cameraSelectEl.appendChild(opt);
        });

        if (devices.length > 1) {
          cameraSelectEl.hidden = false;
        }

        const lastId = localStorage.getItem(LAST_CAMERA_KEY);
        const initialId = devices.some((d) => d.id === lastId)
          ? lastId
          : devices[devices.length - 1].id; // last device is often the external/added one
        cameraSelectEl.value = initialId;

        await startWithSource(initialId);

        cameraSelectEl.addEventListener('change', async () => {
          const newId = cameraSelectEl.value;
          localStorage.setItem(LAST_CAMERA_KEY, newId);
          statusLineEl.textContent = 'Switching camera…';
          try {
            await startWithSource(newId);
            statusLineEl.textContent = '';
          } catch (err) {
            statusLineEl.textContent = 'Could not start that camera.';
            console.error('Camera switch failed:', err);
          }
        });
      } else {
        // No enumerable devices (rare) — fall back to facingMode hint.
        await startWithSource({ facingMode: 'environment' });
      }

      statusLineEl.textContent = '';
    } catch (err) {
      statusLineEl.textContent =
        'Could not access the camera. Check browser permissions and reload.';
      console.error('Camera start failed:', err);
    }
  }

  loadConfig();
  refreshCount();
  setInterval(refreshCount, 15000);
  startScanner();
})();
