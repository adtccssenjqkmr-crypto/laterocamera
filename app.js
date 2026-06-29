// ==========================================================================
// Application State Management
// ==========================================================================
const state = {
  angle: 0.0,
  isAutoScale: true,
  isMirrored: false,
  isVrMode: false,                 // VR/HMDモード (左右画面分割)
  currentFacingMode: 'environment', // 優先して背面カメラを使用
  gridMode: 'plumb',               // デフォルトは十字線
  gridColor: 'cyan',
  gridThickness: 'normal',         // ガイド線の太さ
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
  angleSlider: document.getElementById('angleSlider'),
  angleInput: document.getElementById('angleInput'),
  
  // トグルスイッチ
  autoScaleToggle: document.getElementById('autoScaleToggle'),
  mirrorToggle: document.getElementById('mirrorToggle'),
  vrModeToggle: document.getElementById('vrModeToggle'),
  
  // セレクトボックス
  gridModeSelect: document.getElementById('gridModeSelect'),
  gridColorSelect: document.getElementById('gridColorSelect'),
  gridThicknessSelect: document.getElementById('gridThicknessSelect'),
  
  // アクションボタン
  switchCameraBtn: document.getElementById('switchCameraBtn'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  
  // 参照線リスト (querySelectorAllで一括管理)
  staticRefs: document.querySelectorAll('.static-ref'),
  rotatedRefs: document.querySelectorAll('.rotated-ref'),
  
  // エラーダイアログ
  errorOverlay: document.getElementById('errorOverlay'),
  errorMessage: document.getElementById('errorMessage'),
  retryCameraBtn: document.getElementById('retryCameraBtn'),
  
  // プリセットボタン
  presetButtons: document.querySelectorAll('.preset-btn'),
  
  // 微調整ボタン
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
    // 左目用コンテナの寸法を基準にする（VRモード時は画面半分、通常時は全画面のサイズを自動取得）
    const w = el.leftEye.clientWidth || window.innerWidth;
    const h = el.leftEye.clientHeight || window.innerHeight;
    
    if (w > 0 && h > 0) {
      // 画面アスペクト比の最大値
      const aspectRatio = Math.max(w / h, h / w);
      // 回転角とアスペクト比を考慮した、余白が生じないためのスケール倍率の計算
      scaleFactor = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) * aspectRatio;
    }
  }

  // 左右反転と回転・拡大の組み合わせ
  const horizontalScale = state.isMirrored ? -scaleFactor : scaleFactor;
  const transformString = `rotate(${state.angle}deg) scale(${horizontalScale}, ${scaleFactor})`;

  // 左右のビデオ要素両方に同時に適用
  el.videoLeft.style.transform = transformString;
  el.videoRight.style.transform = transformString;

  // 連動回転するガイドラインの更新
  if (state.gridMode === 'rotated' || state.gridMode === 'both') {
    el.rotatedRefs.forEach(ref => {
      ref.style.transform = `rotate(${state.angle}deg)`;
    });
  }
}

// 角度変更時の状態同期
function setAngle(newAngle) {
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
    // 左右両方のビデオタグにカメラストリームをバインド
    el.videoLeft.srcObject = state.stream;
    el.videoRight.srcObject = state.stream;
    el.errorOverlay.classList.add('hidden');
  } catch (err) {
    console.warn("カメラアクセスエラー (facingMode指定):", err);
    
    // フォールバック1: facingModeなしで試行
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

// 前後カメラのトグル
async function toggleCamera() {
  state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
  
  // 自撮り（イン）カメラの場合は自動でミラー表示を有効化
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

// カメラデバイス一覧の取得
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
  // すべての静的・回転参照線のコンテナ表示を一括制御
  el.staticRefs.forEach(ref => {
    const showStatic = (state.gridMode === 'plumb' || state.gridMode === 'grid' || state.gridMode === 'both');
    ref.style.display = showStatic ? 'block' : 'none';
    
    // 内包要素の制御
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
    // 右目用コンテナを表示
    el.rightEye.classList.remove('hidden');
    
    // HMDへの装着を想定し、3秒後に自動的に操作パネルを閉じる（操作の邪魔にならないようにするため）
    setTimeout(() => {
      if (state.isVrMode) {
        el.controlPanel.classList.add('collapsed');
        el.showControlsBtn.classList.remove('hidden');
      }
    }, 3000);
  } else {
    // 右目用コンテナを非表示
    el.rightEye.classList.add('hidden');
  }

  // アスペクト比や幅が変わるため、スケーリングを再適用
  // トランジションのアニメーション(0.3s)によるズレを防ぐため段階的に更新
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

  // VR/HMD モードトグル
  el.vrModeToggle.addEventListener('change', (e) => {
    toggleVrMode(e.target.checked);
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
  updateGridThickness();
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
