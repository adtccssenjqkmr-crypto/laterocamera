// ==========================================================================
// Application State Management
// ==========================================================================
const state = {
  angle: 0.0,
  isAutoScale: true,
  isMirrored: false,
  currentFacingMode: 'environment', // 優先して背面カメラを使用
  gridMode: 'plumb',               // デフォルトは十字線
  gridColor: 'cyan',
  stream: null,
  availableCameras: []
};

// ==========================================================================
// Color Mapping for Guide Lines
// ==========================================================================
const colorMap = {
  cyan: '#06b6d4',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  white: '#ffffff'
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const el = {
  viewport: document.getElementById('viewport'),
  video: document.getElementById('video'),
  controlPanel: document.getElementById('controlPanel'),
  showControlsBtn: document.getElementById('showControlsBtn'),
  hideControlsBtn: document.getElementById('hideControlsBtn'),
  angleSlider: document.getElementById('angleSlider'),
  angleInput: document.getElementById('angleInput'),
  autoScaleToggle: document.getElementById('autoScaleToggle'),
  mirrorToggle: document.getElementById('mirrorToggle'),
  gridModeSelect: document.getElementById('gridModeSelect'),
  gridColorSelect: document.getElementById('gridColorSelect'),
  switchCameraBtn: document.getElementById('switchCameraBtn'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  staticRef: document.getElementById('staticRef'),
  rotatedRef: document.getElementById('rotatedRef'),
  errorOverlay: document.getElementById('errorOverlay'),
  errorMessage: document.getElementById('errorMessage'),
  retryCameraBtn: document.getElementById('retryCameraBtn'),
  presetButtons: document.querySelectorAll('.preset-btn'),
  
  // Fine-tune buttons
  btnDec10: document.getElementById('btnDec10'),
  btnDec1: document.getElementById('btnDec1'),
  btnDec01: document.getElementById('btnDec01'),
  btnReset: document.getElementById('btnReset'),
  btnInc01: document.getElementById('btnInc01'),
  btnInc1: document.getElementById('btnInc1'),
  btnInc10: document.getElementById('btnInc10')
};

// ==========================================================================
// Video Rendering & Transformation Logic
// ==========================================================================
function updateTransform() {
  const rad = Math.abs((state.angle * Math.PI) / 180);
  let scaleFactor = 1.0;

  if (state.isAutoScale && state.angle !== 0) {
    const w = el.viewport.clientWidth || window.innerWidth;
    const h = el.viewport.clientHeight || window.innerHeight;
    
    if (w > 0 && h > 0) {
      // 画面アスペクト比の最大値（縦向き・横向きに対応）
      const aspectRatio = Math.max(w / h, h / w);
      // 数学的に完璧な対角線カバーのスケール計算式
      scaleFactor = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) * aspectRatio;
    }
  }

  // ミラー表示と回転・拡大を組み合わせたCSS変形
  const horizontalScale = state.isMirrored ? -scaleFactor : scaleFactor;
  el.video.style.transform = `rotate(${state.angle}deg) scale(${horizontalScale}, ${scaleFactor})`;

  // 連動回転するガイドラインの更新
  if (state.gridMode === 'rotated' || state.gridMode === 'both') {
    el.rotatedRef.style.transform = `rotate(${state.angle}deg)`;
  }
}

// 角度変更時の状態同期
function setAngle(newAngle) {
  // 角度を -180 〜 180 の範囲に収める
  let boundedAngle = parseFloat(newAngle);
  if (isNaN(boundedAngle)) boundedAngle = 0.0;
  
  if (boundedAngle > 180) boundedAngle = 180;
  if (boundedAngle < -180) boundedAngle = -180;

  state.angle = Math.round(boundedAngle * 10) / 10; // 小数点第1位までに丸める
  
  // UIの同期
  el.angleInput.value = state.angle.toFixed(1);
  el.angleSlider.value = state.angle;

  // プリセットボタンのアクティブ表示切替
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

// ==========================================================================
// Camera Access Control
// ==========================================================================
async function initCamera() {
  // 既存のカメラストリームを停止
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
    el.video.srcObject = state.stream;
    el.errorOverlay.classList.add('hidden');
  } catch (err) {
    console.warn("カメラアクセスエラー (facingMode指定):", err);
    
    // フォールバック1: facingModeなしで試行
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      el.video.srcObject = state.stream;
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

// 前後カメラのトグル
async function toggleCamera() {
  state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
  // インカメラの場合は自動でミラーを有効化（使いやすさのため）
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

// カメラデバイス一覧の取得（イン/アウト選択の表示切り替え可否判定用）
async function checkCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.availableCameras = devices.filter(d => d.kind === 'videoinput');
    // デバイスが1つしかない場合はカメラ切り替えボタンを非表示にする
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
  // すべて非表示にする
  el.staticRef.style.display = 'none';
  el.rotatedRef.style.display = 'none';
  
  const plumbLineV = el.staticRef.querySelector('.plumb-line-v');
  const plumbLineH = el.staticRef.querySelector('.plumb-line-h');
  const gridMesh = el.staticRef.querySelector('.grid-mesh');
  
  plumbLineV.style.display = 'none';
  plumbLineH.style.display = 'none';
  gridMesh.style.display = 'none';

  switch (state.gridMode) {
    case 'plumb':
      el.staticRef.style.display = 'block';
      plumbLineV.style.display = 'block';
      plumbLineH.style.display = 'block';
      break;
    case 'grid':
      el.staticRef.style.display = 'block';
      gridMesh.style.display = 'block';
      break;
    case 'rotated':
      el.rotatedRef.style.display = 'block';
      break;
    case 'both':
      el.staticRef.style.display = 'block';
      plumbLineV.style.display = 'block';
      plumbLineH.style.display = 'block';
      el.rotatedRef.style.display = 'block';
      break;
    case 'none':
    default:
      break;
  }
  updateTransform();
}

function updateGridColor() {
  const colorCode = colorMap[state.gridColor] || '#06b6d4';
  document.documentElement.style.setProperty('--guide-color', colorCode);
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
  // スライダー操作
  el.angleSlider.addEventListener('input', (e) => {
    setAngle(e.target.value);
  });

  // 数値直接入力
  el.angleInput.addEventListener('change', (e) => {
    setAngle(e.target.value);
  });
  el.angleInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      setAngle(e.target.value);
      el.angleInput.blur();
    }
  });

  // 目盛り(Ticks)をクリックしてその角度を設定
  document.querySelectorAll('.slider-ticks .tick').forEach(tick => {
    tick.addEventListener('click', () => {
      setAngle(tick.getAttribute('data-val'));
    });
  });

  // プリセットボタン操作
  el.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setAngle(btn.getAttribute('data-angle'));
    });
  });

  // 微調整ボタン
  el.btnDec10.addEventListener('click', () => setAngle(state.angle - 10));
  el.btnDec1.addEventListener('click', () => setAngle(state.angle - 1));
  el.btnDec01.addEventListener('click', () => setAngle(state.angle - 0.1));
  el.btnReset.addEventListener('click', () => setAngle(0.0));
  el.btnInc01.addEventListener('click', () => setAngle(state.angle + 0.1));
  el.btnInc1.addEventListener('click', () => setAngle(state.angle + 1));
  el.btnInc10.addEventListener('click', () => setAngle(state.angle + 10));

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

  // グリッド表示モード
  el.gridModeSelect.addEventListener('change', (e) => {
    state.gridMode = e.target.value;
    updateGridMode();
  });

  // グリッドラインの色
  el.gridColorSelect.addEventListener('change', (e) => {
    state.gridColor = e.target.value;
    updateGridColor();
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

  // ウィンドウのリサイズイベント（自動ズーム倍率の動的再計算用）
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
  updateGridMode();
  
  await initCamera();
  await checkCameraDevices();
  
  // 初期位置反映
  setAngle(0.0);
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
