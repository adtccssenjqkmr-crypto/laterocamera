// ==========================================================================
// Application State Management
// ==========================================================================
const state = {
  angle: 0.0,                      // 左右傾き (Roll)
  pitch: 0.0,                      // 前後勾配 (Pitch) - 手動設定値
  zoom: 1.0,                       // ハードウェアズーム倍率
  isAutoScale: true,
  isMirrored: false,
  isVrMode: false,                 // VR/HMDモード
  isGyroEnabled: false,            // ジャイロセンサー連動
  gyroGain: 1.5,                   // ジャイロ感度（倍率）
  initialBeta: null,               // ジャイロ基準角
  gyroOffset: 0.0,                 // ジャイロによる動的傾きオフセット
  selectedDeviceId: null,          // 選択中のカメラデバイスID
  gridMode: 'plumb',               // デフォルトは十字線
  gridColor: 'cyan',
  gridThickness: 'normal',
  stream: null,
  availableCameras: []
};

// ==========================================================================
// Mappings for CSS Properties
// ==========================================================================
const colorMap = {
  cyan: '#06b6d4',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  white: '#ffffff'
};

const thicknessMap = {
  thin: '1.0px',
  normal: '1.5px',
  thick: '3.0px',
  extra: '5.0px'
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const el = {
  // ビューポートと目用コンテナ
  viewport: document.getElementById('viewport'),
  leftEye: document.getElementById('leftEye'),
  rightEye: document.getElementById('rightEye'),
  
  // ビデオ要素 (左右)
  videoLeft: document.getElementById('videoLeft'),
  videoRight: document.getElementById('videoRight'),
  
  // パネルコントロール
  controlPanel: document.getElementById('controlPanel'),
  showControlsBtn: document.getElementById('showControlsBtn'),
  hideControlsBtn: document.getElementById('hideControlsBtn'),
  
  // 左右傾きコントロール (ロール)
  angleSlider: document.getElementById('angleSlider'),
  angleInput: document.getElementById('angleInput'),
  presetButtons: document.querySelectorAll('.preset-btn'),
  
  // 前後勾配コントロール (ピッチ)
  pitchSlider: document.getElementById('pitchSlider'),
  pitchInput: document.getElementById('pitchInput'),
  presetPitchButtons: document.querySelectorAll('.preset-pitch-btn'),
  
  // ズームコントロール
  zoomSection: document.getElementById('zoomSection'),
  zoomSlider: document.getElementById('zoomSlider'),
  zoomValue: document.getElementById('zoomValue'),
  
  // トグルスイッチ
  autoScaleToggle: document.getElementById('autoScaleToggle'),
  mirrorToggle: document.getElementById('mirrorToggle'),
  vrModeToggle: document.getElementById('vrModeToggle'),
  gyroToggle: document.getElementById('gyroToggle'),
  
  // セレクトボックス
  gridModeSelect: document.getElementById('gridModeSelect'),
  gridColorSelect: document.getElementById('gridColorSelect'),
  gridThicknessSelect: document.getElementById('gridThicknessSelect'),
  gyroGainSelect: document.getElementById('gyroGainSelect'),
  cameraSelect: document.getElementById('cameraSelect'),
  
  // アクションボタン
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  
  // 参照線リスト
  staticRefs: document.querySelectorAll('.static-ref'),
  rotatedRefs: document.querySelectorAll('.rotated-ref'),
  
  // エラーダイアログ
  errorOverlay: document.getElementById('errorOverlay'),
  errorMessage: document.getElementById('errorMessage'),
  retryCameraBtn: document.getElementById('retryCameraBtn'),
  
  // ロール微調整ボタン
  btnDec10: document.getElementById('btnDec10'),
  btnDec1: document.getElementById('btnDec1'),
  btnDec01: document.getElementById('btnDec01'),
  btnReset: document.getElementById('btnReset'),
  btnInc01: document.getElementById('btnInc01'),
  btnInc1: document.getElementById('btnInc1'),
  btnInc10: document.getElementById('btnInc10'),
  
  // ピッチ微調整ボタン
  btnPitchDec5: document.getElementById('btnPitchDec5'),
  btnPitchDec1: document.getElementById('btnPitchDec1'),
  btnPitchReset: document.getElementById('btnPitchReset'),
  btnPitchInc1: document.getElementById('btnPitchInc1'),
  btnPitchInc5: document.getElementById('btnPitchInc5')
};

// ==========================================================================
// Video Rendering & Transformation Logic
// ==========================================================================
function updateTransform() {
  const radRoll = Math.abs((state.angle * Math.PI) / 180);
  let visualPitch = state.pitch + (state.isGyroEnabled ? state.gyroOffset : 0.0);
  
  if (visualPitch > 45) visualPitch = 45;
  if (visualPitch < -45) visualPitch = -45;
  
  const radPitch = Math.abs((visualPitch * Math.PI) / 180);
  const pitchShiftY = visualPitch * 3.5;

  let baseScale = 1.0;
  let pitchScale = 1.0;

  const w = el.leftEye.clientWidth || window.innerWidth;
  const h = el.leftEye.clientHeight || window.innerHeight;

  if (state.isAutoScale) {
    if (w > 0 && h > 0) {
      if (state.angle !== 0) {
        const aspectRatio = Math.max(w / h, h / w);
        baseScale = Math.abs(Math.cos(radRoll)) + Math.abs(Math.sin(radRoll)) * aspectRatio;
      }
      
      if (visualPitch !== 0) {
        const tiltCorrection = 1.0 + Math.abs(Math.sin(radPitch)) * 0.45;
        const shiftCorrection = 1.0 + (Math.abs(pitchShiftY) / (h / 2));
        pitchScale = tiltCorrection * shiftCorrection;
      }
    }
  }

  const totalScale = baseScale * pitchScale;
  const horizontalScale = state.isMirrored ? -totalScale : totalScale;

  const transformString = `
    perspective(800px) 
    rotateX(${visualPitch}deg) 
    translateY(${-pitchShiftY}px) 
    rotate(${state.angle}deg) 
    scale(${horizontalScale}, ${totalScale})
  `;

  el.videoLeft.style.transform = transformString;
  el.videoRight.style.transform = transformString;

  if (state.gridMode === 'rotated' || state.gridMode === 'both') {
    el.rotatedRefs.forEach(ref => {
      ref.style.transform = `rotate(${state.angle}deg)`;
    });
  }
}

// ロール同期
function setAngle(newAngle) {
  let boundedAngle = parseFloat(newAngle);
  if (isNaN(boundedAngle)) boundedAngle = 0.0;
  
  if (boundedAngle > 180) boundedAngle = 180;
  if (boundedAngle < -180) boundedAngle = -180;

  state.angle = Math.round(boundedAngle * 10) / 10;
  
  el.angleInput.value = state.angle.toFixed(1);
  el.angleSlider.value = state.angle;

  el.presetButtons.forEach(btn => {
    const btnAngle = parseFloat(btn.getAttribute('data-angle'));
    if (btnAngle === state.angle) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateTransform();
}

// ピッチ同期
function setPitch(newPitch) {
  let boundedPitch = parseFloat(newPitch);
  if (isNaN(boundedPitch)) boundedPitch = 0.0;
  
  if (boundedPitch > 45) boundedPitch = 45;
  if (boundedPitch < -45) boundedPitch = -45;

  state.pitch = Math.round(boundedPitch * 10) / 10;
  
  el.pitchInput.value = state.pitch.toFixed(1);
  el.pitchSlider.value = state.pitch;

  el.presetPitchButtons.forEach(btn => {
    const btnPitch = parseFloat(btn.getAttribute('data-pitch'));
    if (btnPitch === state.pitch) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateTransform();
}

// ==========================================================================
// Device Orientation (Gyro Sensor) Handling
// ==========================================================================
async function handleOrientation(event) {
  if (!state.isGyroEnabled) return;

  const beta = event.beta;
  if (beta === null) return;

  if (state.initialBeta === null) {
    state.initialBeta = beta;
    return;
  }

  let delta = beta - state.initialBeta;

  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  state.gyroOffset = delta * state.gyroGain;
  updateTransform();
}

async function requestDeviceOrientationPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permissionState = await DeviceOrientationEvent.requestPermission();
      return permissionState === 'granted';
    } catch (error) {
      console.error("ジャイロ許可取得エラー:", error);
      return false;
    }
  }
  return true;
}

async function setGyroEnabled(enabled) {
  if (enabled) {
    const isGranted = await requestDeviceOrientationPermission();
    if (isGranted) {
      state.isGyroEnabled = true;
      state.initialBeta = null;
      state.gyroOffset = 0.0;
      el.gyroToggle.checked = true;
      window.addEventListener('deviceorientation', handleOrientation);
      console.log("ジャイロ連動開始");
    } else {
      alert("ジャイロセンサーへのアクセスが拒否されました。");
      state.isGyroEnabled = false;
      el.gyroToggle.checked = false;
    }
  } else {
    state.isGyroEnabled = false;
    state.gyroOffset = 0.0;
    el.gyroToggle.checked = false;
    window.removeEventListener('deviceorientation', handleOrientation);
    console.log("ジャイロ連動停止");
    updateTransform();
  }
}

// ==========================================================================
// Camera Access Control & Zoom Integration
// ==========================================================================
async function initCamera() {
  // 既存ストリームのクリア
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
  }

  // カメラ制約の構築
  let videoConstraint = {};
  if (state.selectedDeviceId) {
    // 選択されたカメラIDによる精密起動
    videoConstraint = {
      deviceId: { exact: state.selectedDeviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    };
  } else {
    // 初期起動時: デフォルト背面カメラをリクエスト
    videoConstraint = {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    };
  }

  const constraints = {
    audio: false,
    video: videoConstraint
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    el.videoLeft.srcObject = state.stream;
    el.videoRight.srcObject = state.stream;
    el.errorOverlay.classList.add('hidden');

    const activeTrack = state.stream.getVideoTracks()[0];
    
    // 実際に起動したカメラのデバイスIDを取得して状態に記録
    if (activeTrack.getSettings) {
      state.selectedDeviceId = activeTrack.getSettings().deviceId || state.selectedDeviceId;
    }

    // カメラズーム機能の検知と設定
    setupCameraZoom(activeTrack);
    
  } catch (err) {
    console.warn("カメラ起動エラー (制約指定):", err);
    try {
      // 最低限のフォールバック起動
      state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      el.videoLeft.srcObject = state.stream;
      el.videoRight.srcObject = state.stream;
      el.errorOverlay.classList.add('hidden');
      
      const activeTrack = state.stream.getVideoTracks()[0];
      setupCameraZoom(activeTrack);
    } catch (fallbackErr) {
      console.error("全カメラアクセス失敗:", fallbackErr);
      showCameraError(fallbackErr);
    }
  }
}

// カメラズーム機能の検知・設定処理
function setupCameraZoom(track) {
  if (!track) return;
  
  const hasCapabilities = typeof track.getCapabilities === 'function';
  const capabilities = hasCapabilities ? track.getCapabilities() : {};
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};

  // デジタルズームがサポートされているかチェック (一部のChrome系ブラウザ)
  if (capabilities.zoom) {
    el.zoomSection.classList.remove('hidden');
    
    const minZoom = capabilities.zoom.min || 1.0;
    const maxZoom = capabilities.zoom.max || 5.0;
    const stepZoom = capabilities.zoom.step || 0.1;
    
    el.zoomSlider.min = minZoom;
    el.zoomSlider.max = maxZoom;
    el.zoomSlider.step = stepZoom;
    
    // 現在のズーム値を適用、無ければ最小値
    state.zoom = settings.zoom || minZoom;
    el.zoomSlider.value = state.zoom;
    el.zoomValue.textContent = state.zoom.toFixed(1);

    // スライダ目盛りラベルの更新
    document.getElementById('zoomMinTick').textContent = minZoom.toFixed(1) + 'x';
    document.getElementById('zoomMidTick').textContent = ((minZoom + maxZoom) / 2).toFixed(1) + 'x';
    document.getElementById('zoomMaxTick').textContent = maxZoom.toFixed(1) + 'x';
  } else {
    // ズーム非対応デバイスではコントローラーを隠す
    el.zoomSection.classList.add('hidden');
  }
}

// デジタルズームの適用
async function applyZoom(value) {
  const track = state.stream ? state.stream.getVideoTracks()[0] : null;
  if (track && typeof track.applyConstraints === 'function') {
    try {
      await track.applyConstraints({ advanced: [{ zoom: parseFloat(value) }] });
      state.zoom = parseFloat(value);
      el.zoomValue.textContent = state.zoom.toFixed(1);
      console.log("ズーム倍率適用:", state.zoom);
    } catch (e) {
      console.warn("ズーム適用エラー:", e);
    }
  }
}

function showCameraError(error) {
  let msg = "カメラのアクセス許可が拒否されたか、他のアプリで使用されている可能性があります。";
  if (error.name === 'NotAllowedError') {
    msg = "ブラウザのカメラアクセス権限が拒否されています。設定から許可してください。";
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    msg = "デバイスに利用可能なカメラが見つかりません。";
  }
  el.errorMessage.textContent = msg;
  el.errorOverlay.classList.remove('hidden');
}

// 利用可能なカメラデバイス一覧の取得とセレクトボックス構築
async function checkCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.availableCameras = devices.filter(d => d.kind === 'videoinput');
    
    // カメラセレクトボックスをクリア
    el.cameraSelect.innerHTML = '';
    
    // セレクトボックスに選択肢を追加
    state.availableCameras.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      
      // カメラの向きや特徴を分かりやすく日本語変換
      let label = device.label || `カメラ ${index + 1}`;
      if (label.includes('facing back') || label.includes('back') || label.includes('背面')) {
        // 広角や望遠レンズが名前から判別できる場合があるため補正
        if (label.includes('ultra wide') || label.includes('広角') || label.includes('wide')) {
          label = `背面超広角カメラ (${index + 1})`;
        } else {
          label = `背面カメラ (${index + 1})`;
        }
      } else if (label.includes('facing front') || label.includes('front') || label.includes('前面')) {
        label = `インカメラ (前面)`;
      }
      
      option.textContent = label;
      
      // 現在起動中のカメラIDと一致すれば選択状態にする
      if (device.deviceId === state.selectedDeviceId) {
        option.selected = true;
      }
      
      el.cameraSelect.appendChild(option);
    });
    
  } catch (e) {
    console.warn("カメラデバイス一覧の取得に失敗:", e);
  }
}

// ==========================================================================
// UI Reference lines (Grid / Plumb lines) Control
// ==========================================================================
function updateGridMode() {
  el.staticRefs.forEach(ref => {
    const showStatic = (state.gridMode === 'plumb' || state.gridMode === 'grid' || state.gridMode === 'both');
    ref.style.display = showStatic ? 'block' : 'none';
    
    const plumbLineV = ref.querySelector('.plumb-line-v');
    const plumbLineH = ref.querySelector('.plumb-line-h');
    const gridMesh = ref.querySelector('.grid-mesh');
    
    if (plumbLineV) plumbLineV.style.display = (state.gridMode === 'plumb' || state.gridMode === 'both') ? 'block' : 'none';
    if (plumbLineH) plumbLineH.style.display = (state.gridMode === 'plumb' || state.gridMode === 'both') ? 'block' : 'none';
    if (gridMesh) gridMesh.style.display = (state.gridMode === 'grid') ? 'block' : 'none';
  });

  el.rotatedRefs.forEach(ref => {
    const showRotated = (state.gridMode === 'rotated' || state.gridMode === 'both');
    ref.style.display = showRotated ? 'block' : 'none';
  });
  
  updateTransform();
}

function updateGridColor() {
  const colorCode = colorMap[state.gridColor] || '#06b6d4';
  document.documentElement.style.setProperty('--guide-color', colorCode);
}

function updateGridThickness() {
  const thicknessVal = thicknessMap[state.gridThickness] || '1.5px';
  document.documentElement.style.setProperty('--guide-thickness', thicknessVal);
}

// ==========================================================================
// VR/HMD Mode Layout Control
// ==========================================================================
function toggleVrMode(enabled) {
  state.isVrMode = enabled;
  el.vrModeToggle.checked = enabled;

  if (state.isVrMode) {
    el.rightEye.classList.remove('hidden');
    setTimeout(() => {
      if (state.isVrMode) {
        el.controlPanel.classList.add('collapsed');
        el.showControlsBtn.classList.remove('hidden');
      }
    }, 3000);
  } else {
    el.rightEye.classList.add('hidden');
  }

  updateTransform();
  setTimeout(updateTransform, 150);
  setTimeout(updateTransform, 350);
}

// ==========================================================================
// Fullscreen Control
// ==========================================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`全画面表示エラー: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// ==========================================================================
// Event Listeners Setup
// ==========================================================================
function setupEventListeners() {
  // 左右スライダー操作
  el.angleSlider.addEventListener('input', (e) => {
    setAngle(e.target.value);
  });

  // 左右数値直接入力
  el.angleInput.addEventListener('change', (e) => {
    setAngle(e.target.value);
  });
  el.angleInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      setAngle(e.target.value);
      el.angleInput.blur();
    }
  });

  // 左右目盛りクリック
  document.querySelectorAll('.slider-ticks .tick').forEach(tick => {
    tick.addEventListener('click', () => {
      setAngle(tick.getAttribute('data-val'));
    });
  });

  // 左右プリセットボタン操作
  el.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setAngle(btn.getAttribute('data-angle'));
    });
  });

  // 左右微調整ボタン
  el.btnDec10.addEventListener('click', () => setAngle(state.angle - 10));
  el.btnDec1.addEventListener('click', () => setAngle(state.angle - 1));
  el.btnDec01.addEventListener('click', () => setAngle(state.angle - 0.1));
  el.btnReset.addEventListener('click', () => setAngle(0.0));
  el.btnInc01.addEventListener('click', () => setAngle(state.angle + 0.1));
  el.btnInc1.addEventListener('click', () => setAngle(state.angle + 1));
  el.btnInc10.addEventListener('click', () => setAngle(state.angle + 10));

  // 前後スライダー操作
  el.pitchSlider.addEventListener('input', (e) => {
    setPitch(e.target.value);
  });

  // 前後数値直接入力
  el.pitchInput.addEventListener('change', (e) => {
    setPitch(e.target.value);
  });
  el.pitchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      setPitch(e.target.value);
      el.pitchInput.blur();
    }
  });

  // 前後目盛りクリック
  document.querySelectorAll('.slider-ticks .tick-pitch').forEach(tick => {
    tick.addEventListener('click', () => {
      setPitch(tick.getAttribute('data-val'));
    });
  });

  // 前後プリセットボタン操作
  el.presetPitchButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setPitch(btn.getAttribute('data-pitch'));
    });
  });

  // 前後微調整ボタン
  el.btnPitchDec5.addEventListener('click', () => setPitch(state.pitch - 5));
  el.btnPitchDec1.addEventListener('click', () => setPitch(state.pitch - 1));
  el.btnPitchReset.addEventListener('click', () => setPitch(0.0));
  el.btnPitchInc1.addEventListener('click', () => setPitch(state.pitch + 1));
  el.btnPitchInc5.addEventListener('click', () => setPitch(state.pitch + 5));

  // ズームスライダー操作
  el.zoomSlider.addEventListener('input', (e) => {
    applyZoom(e.target.value);
  });

  // 自動ズームトグル
  el.autoScaleToggle.addEventListener('change', (e) => {
    state.isAutoScale = e.target.checked;
    updateTransform();
  });

  // ミラートグル
  el.mirrorToggle.addEventListener('change', (e) => {
    state.isMirrored = e.target.checked;
    updateTransform();
  });

  // VR/HMD モードトグル
  el.vrModeToggle.addEventListener('change', (e) => {
    toggleVrMode(e.target.checked);
  });

  // ジャイロ連動トグル
  el.gyroToggle.addEventListener('change', (e) => {
    setGyroEnabled(e.target.checked);
  });

  // ジャイロ感度設定
  el.gyroGainSelect.addEventListener('change', (e) => {
    state.gyroGain = parseFloat(e.target.value);
    state.initialBeta = null;
  });

  // カメラデバイスセレクトボックス切り替え
  el.cameraSelect.addEventListener('change', (e) => {
    state.selectedDeviceId = e.target.value;
    
    // インカメラ（前面）が選択された場合は自動で左右反転（ミラー）を有効にする
    const selectedOption = e.target.options[e.target.selectedIndex];
    if (selectedOption && selectedOption.textContent.includes('インカメラ')) {
      state.isMirrored = true;
      el.mirrorToggle.checked = true;
    } else {
      state.isMirrored = false;
      el.mirrorToggle.checked = false;
    }
    
    initCamera();
  });

  // 参照線表示モード
  el.gridModeSelect.addEventListener('change', (e) => {
    state.gridMode = e.target.value;
    updateGridMode();
  });

  // 参照線色
  el.gridColorSelect.addEventListener('change', (e) => {
    state.gridColor = e.target.value;
    updateGridColor();
  });

  // 参照線の太さ
  el.gridThicknessSelect.addEventListener('change', (e) => {
    state.gridThickness = e.target.value;
    updateGridThickness();
  });

  // 全画面
  el.fullscreenBtn.addEventListener('click', toggleFullscreen);

  // パネル折りたたみ
  el.hideControlsBtn.addEventListener('click', () => {
    el.controlPanel.classList.add('collapsed');
    el.showControlsBtn.classList.remove('hidden');
  });

  // パネル展開
  el.showControlsBtn.addEventListener('click', () => {
    el.controlPanel.classList.remove('collapsed');
    el.showControlsBtn.classList.add('hidden');
  });

  // エラー時再試行
  el.retryCameraBtn.addEventListener('click', initCamera);

  // ウィンドウのリサイズイベント
  window.addEventListener('resize', () => {
    updateTransform();
  });
}

// ==========================================================================
// Initialization
// ==========================================================================
async function init() {
  setupEventListeners();
  updateGridColor();
  updateGridThickness();
  updateGridMode();
  
  await initCamera();
  await checkCameraDevices();
  
  // 初期位置反映
  setAngle(0.0);
  setPitch(0.0);
}

// ページロード完了後に初期化
window.addEventListener('DOMContentLoaded', init);

// サービスワーカーの登録 (PWA用)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('ServiceWorker registered:', reg.scope))
      .catch(err => console.warn('ServiceWorker registration failed:', err));
  });
}
