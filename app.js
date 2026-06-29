// ==========================================================================
// Application State Management
// ==========================================================================
const state = {
  angle: 0.0,                      // 左右傾き (Roll)
  pitch: 0.0,                      // 前後勾配 (Pitch) - 手動設定値
  isAutoScale: true,
  isMirrored: false,
  isVrMode: false,                 // VR/HMDモード
  isGyroEnabled: false,            // ジャイロセンサー連動
  gyroGain: 1.5,                   // ジャイロ感度（倍率）
  initialBeta: null,               // ジャイロ基準角（キャリブレーション用）
  gyroOffset: 0.0,                 // ジャイロによる動的傾きオフセット
  currentFacingMode: 'environment', // 優先して背面カメラを使用
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
  
  // アクションボタン
  switchCameraBtn: document.getElementById('switchCameraBtn'),
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
  
  // 実質適用するピッチ角（手動設定値 ＋ ジャイロ動的変化量）
  let visualPitch = state.pitch + (state.isGyroEnabled ? state.gyroOffset : 0.0);
  
  // 安全限界を設定（HMDで表示がおかしくならないよう -45° 〜 45° に制限）
  if (visualPitch > 45) visualPitch = 45;
  if (visualPitch < -45) visualPitch = -45;
  
  const radPitch = Math.abs((visualPitch * Math.PI) / 180);

  // 視線誘導のための上下垂直シフト（1度につき約 3.5 ピクセル移動）
  const pitchShiftY = visualPitch * 3.5;

  let baseScale = 1.0;
  let pitchScale = 1.0;

  // 1つの目用コンテナの寸法を取得
  const w = el.leftEye.clientWidth || window.innerWidth;
  const h = el.leftEye.clientHeight || window.innerHeight;

  if (state.isAutoScale) {
    if (w > 0 && h > 0) {
      // 左右ロール回転による余白補正
      if (state.angle !== 0) {
        const aspectRatio = Math.max(w / h, h / w);
        baseScale = Math.abs(Math.cos(radRoll)) + Math.abs(Math.sin(radRoll)) * aspectRatio;
      }
      
      // 前後ピッチ傾斜および上下シフトによる余白補正
      if (visualPitch !== 0) {
        // ピッチ傾斜による台形歪み補正 (3D回転による天地の縮み補正)
        const tiltCorrection = 1.0 + Math.abs(Math.sin(radPitch)) * 0.45;
        // 上下シフトによる余白補正
        const shiftCorrection = 1.0 + (Math.abs(pitchShiftY) / (h / 2));
        
        pitchScale = tiltCorrection * shiftCorrection;
      }
    }
  }

  // アスペクト比を維持しつつ均等に拡大
  const totalScale = baseScale * pitchScale;
  const horizontalScale = state.isMirrored ? -totalScale : totalScale;

  // 3D遠近感 (perspective), 前後ピッチ (rotateX), 水平シフト (translateY), 左右ロール (rotateZ), 拡大率 (scale) を統合
  // 注意: rotateXのパース適用のため perspective をトランスフォームの先頭に定義します
  const transformString = `
    perspective(800px) 
    rotateX(${visualPitch}deg) 
    translateY(${-pitchShiftY}px) 
    rotate(${state.angle}deg) 
    scale(${horizontalScale}, ${totalScale})
  `;

  // 左右のビデオ要素に適用
  el.videoLeft.style.transform = transformString;
  el.videoRight.style.transform = transformString;

  // 映像連動回転参照線の回転更新
  if (state.gridMode === 'rotated' || state.gridMode === 'both') {
    el.rotatedRefs.forEach(ref => {
      ref.style.transform = `rotate(${state.angle}deg)`;
    });
  }
}

// 左右角度 (Roll) の状態同期
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

// 前後勾配 (Pitch) の状態同期
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

  const beta = event.beta; // デバイスの前後傾き (-180 〜 180)
  if (beta === null) return;

  // 最初のイベント受信時に現在角を基準点（0）としてキャリブレーション
  if (state.initialBeta === null) {
    state.initialBeta = beta;
    return;
  }

  // 基準点からの変化量を取得
  let delta = beta - state.initialBeta;

  // 180度境界の回り込み補正
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  // 感度倍率を乗算して映像ピッチオフセットに適用
  state.gyroOffset = delta * state.gyroGain;
  
  // 描画更新
  updateTransform();
}

// iOS 13+ でのモーションセンサーパーミッション要求
async function requestDeviceOrientationPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permissionState = await DeviceOrientationEvent.requestPermission();
      return permissionState === 'granted';
    } catch (error) {
      console.error("ジャイロセンサーアクセス許可取得エラー:", error);
      return false;
    }
  }
  return true; // それ以外の環境は許可不要で即時利用可能
}

// ジャイロ連動の有効化・無効化
async function setGyroEnabled(enabled) {
  if (enabled) {
    const isGranted = await requestDeviceOrientationPermission();
    if (isGranted) {
      state.isGyroEnabled = true;
      state.initialBeta = null; // キャリブレーションの再トリガー
      state.gyroOffset = 0.0;
      el.gyroToggle.checked = true;
      
      // ジャイロイベントの監視を開始
      window.addEventListener('deviceorientation', handleOrientation);
      console.log("ジャイロ連動開始");
    } else {
      alert("ジャイロセンサー（モーションセンサー）へのアクセスが拒否されたため、連動機能を開始できませんでした。");
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
// Camera Access Control
// ==========================================================================
async function initCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: state.currentFacingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    el.videoLeft.srcObject = state.stream;
    el.videoRight.srcObject = state.stream;
    el.errorOverlay.classList.add('hidden');
  } catch (err) {
    console.warn("カメラアクセスエラー (facingMode指定):", err);
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      el.videoLeft.srcObject = state.stream;
      el.videoRight.srcObject = state.stream;
      el.errorOverlay.classList.add('hidden');
    } catch (fallbackErr) {
      console.error("すべてのカメラアクセスに失敗:", fallbackErr);
      showCameraError(fallbackErr);
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

async function toggleCamera() {
  state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
  if (state.currentFacingMode === 'user') {
    state.isMirrored = true;
    el.mirrorToggle.checked = true;
  } else {
    state.isMirrored = false;
    el.mirrorToggle.checked = false;
  }
  await initCamera();
  updateTransform();
}

async function checkCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.availableCameras = devices.filter(d => d.kind === 'videoinput');
    if (state.availableCameras.length <= 1) {
      el.switchCameraBtn.style.display = 'none';
    } else {
      el.switchCameraBtn.style.display = 'inline-flex';
    }
  } catch (e) {
    console.warn("デバイスリストの取得に失敗しました:", e);
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
    state.initialBeta = null; // 感度変更時にキャリブレーションをリセット
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

  // カメラ切り替え
  el.switchCameraBtn.addEventListener('click', toggleCamera);

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
