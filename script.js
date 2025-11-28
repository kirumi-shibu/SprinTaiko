// --- DOM要素の取得 ---
const dom = {
  countdownDisplay: document.getElementById("countdown"),
  notesDisplay: document.getElementById("notes-display"),
  targetIndicator: document.getElementById("target-note-indicator"),
  progressBar: document.getElementById("progress-bar"),
  timerDisplay: document.getElementById("timer"),
  missDisplay: document.getElementById("miss"),
  remainingNotesDisplay: document.getElementById("remaining-notes"),
  startButton: document.getElementById("start-button"),
  bottomWrapper: document.getElementById("bottom-wrapper"),
  clearTimeDisplay: document.getElementById("clear-time"),
  finalScoreDisplay: document.getElementById("final-score"),
  penaltyCountDisplay: document.getElementById("penalty-count"),
  kpsDisplay: document.getElementById("kps-display"),
  rankingList: document.getElementById("ranking-list"),
  speedDisplay: document.getElementById("speed-display"),
  speedUpBtn: document.getElementById("speed-up-btn"),
  speedDownBtn: document.getElementById("speed-down-btn"),
  notesCountInput: document.getElementById("notes-count-input"),
  settingsPanel: document.getElementById("settings-panel"),
  openSettingsBtn: document.getElementById("open-settings-btn"),
  closeSettingsBtn: document.getElementById("close-settings-btn"),
  resetSoundsBtn: document.getElementById("reset-sounds-btn"),
  soundFileInputs: document.querySelectorAll(".sound-file-input"),
  singleResetSoundBtns: document.querySelectorAll(".reset-single-sound-btn"),
  helpPanel: document.getElementById("help-panel"),
  openHelpBtn: document.getElementById("open-help-btn"),
  closeHelpBtn: document.getElementById("close-help-btn"),
  resetRankingBtn: document.getElementById("reset-ranking-btn"),
  volumeSlider: document.getElementById("volume-slider"),
  volumeDisplay: document.getElementById("volume-display"),
  versionDisplay: document.getElementById("version-display"),
  advancedSettingsPanel: document.getElementById("advanced-settings-panel"),
  openAdvancedSettingsBtn: document.getElementById(
    "open-advanced-settings-btn"
  ),
  closeAdvancedSettingsBtn: document.getElementById(
    "close-advanced-settings-btn"
  ),
  animationSpeedSlider: document.getElementById("animation-speed-slider"),
  animationSpeedDisplay: document.getElementById("animation-speed-display"),
  resetKeyConfigBtn: document.getElementById("reset-key-config-btn"),
};

// --- 定数定義 ---
const VERSION = "v2025.11.28.8"; // ★ここにバージョンを定義
const RANKING_SIZE = 5; // ランキングの保存件数
const RANKING_KEY = "sprintaiko-ranking"; // localStorageのキー
const NOTE_TYPES = ["don", "ka"]; // 音符の種類
const HISPEED_KEY = "sprintaiko-hispeed"; // localStorageのキー
const NOTES_COUNT_KEY = "sprintaiko-notes-count"; // localStorageのキー
const CUSTOM_SOUND_KEY_PREFIX = "sprintaiko-sound-"; // カスタム音声のキープレフィックス
const VOLUME_KEY = "sprintaiko-volume"; // 音量のキー
const ANIMATION_SPEED_KEY = "sprintaiko-animation-speed"; // アニメーション速度のキー
const MISS_PENALTY_TIME = 500; // ミスした場合のタイマーペナルティ (ミリ秒)
const COUNTDOWN_INTERVAL = 500; // カウントダウンの間隔 (ms)
const KEY_CONFIG_KEY = "sprintaiko-key-config"; // キー設定のキー

// --- 音声管理 ---
let audioContext;
let masterGainNode; // 全ての音量を制御するマスターGainNode
const audioBuffers = {};
const playingSources = {}; // 再生中のAudioBufferSourceNodeを保持するオブジェクト
const AUDIO_FILES = {
  don: "audio/don.ogg",
  ka: "audio/ka.ogg",
  miss: "audio/miss.ogg",
  clear: "audio/clear.ogg",
  countdown: "audio/countdown.ogg", // カウントダウン音
  cancel: "audio/cancel.ogg", // 中断音
};
// 音声読み込みが完了したかどうかのフラグ
let isAudioLoaded = false;

// --- ゲーム状態管理 ---
const gameState = {
  sequence: [], // 生成された音符のシーケンス
  currentIndex: 0, // 現在叩くべき音符のインデックス
  startTime: 0, // ゲーム開始時間
  missCount: 0, // ミスの回数
  isActive: false, // ゲームが進行中かどうかのフラグ
  isStarting: false, // スタート処理中かどうかのフラグ
  hiSpeed: 1.0, // ハイスピード設定
  notesCount: 100, // ノーツ数
  volume: 0.25, // 音量
  keyConfig: {
    don_left: "f",
    don_right: "j",
    ka_left: "d",
    ka_right: "k",
  },
};
let keyMap = {}; // keyConfigから生成される逆引きマップ

// タイマーのID
let timerInterval = null; // タイマーのID

/**
 * Web Audio APIのAudioContextを初期化する
 */
function initAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // マスター音量を管理するGainNodeを作成し、最終出力に接続する
      masterGainNode = audioContext.createGain();
      masterGainNode.connect(audioContext.destination);
      updateVolume(gameState.volume, false); // 初期音量を適用
    } catch (e) {
      console.error("Web Audio API is not supported in this browser");
    }
  }
}

/**
 * 指定されたURLから音声ファイルを読み込み、デコードしてAudioBufferを返す
 * @param {string} url 音声ファイルのURL
 * @returns {Promise<AudioBuffer>}
 */
async function loadAudio(url) {
  if (!audioContext) return;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * すべての音声ファイルを読み込む。カスタム音声があればそちらを優先する。
 */
async function loadAllAudio() {
  // AudioContextがなければ何もしない
  if (!audioContext) return;
  // 既に読み込み済みなら何もしない
  if (isAudioLoaded) return;

  // --- カスタム音声の読み込み試行 ---
  const customSoundPromises = Object.keys(AUDIO_FILES).map(async (key) => {
    const dataUrl = localStorage.getItem(CUSTOM_SOUND_KEY_PREFIX + key);
    if (dataUrl) {
      try {
        const response = await fetch(dataUrl);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers[key] = await audioContext.decodeAudioData(arrayBuffer);
        console.log(`Loaded custom sound for: ${key}`);
      } catch (e) {
        console.error(`Failed to load custom sound for ${key}:`, e);
      }
    }
  });
  await Promise.all(customSoundPromises);

  // 全ての音声ファイルを並行して読み込む
  const loadPromises = Object.entries(AUDIO_FILES).map(async ([key, path]) => {
    // カスタム音声が読み込まれていない場合のみ、デフォルト音声を読み込む
    if (!audioBuffers[key]) {
      audioBuffers[key] = await loadAudio(path);
    }
  });
  await Promise.all(loadPromises);
  isAudioLoaded = true;
  console.log("All audio files loaded.");
}

/**
 * 指定されたキーの音声を再生する。同じ音が再生中の場合は停止してから再生する。
 * @param {string} soundKey 再生する音声のキー (e.g., 'don', 'ka')
 */
function playSound(soundKey) {
  const buffer = audioBuffers[soundKey];
  if (!audioContext || !buffer) return;

  // もし同じ音がすでに再生中なら、それを停止する
  if (playingSources[soundKey]) {
    playingSources[soundKey].stop();
    console.log(`Stopped previous sound: ${soundKey}`);
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGainNode); // 最終出力の代わりにマスターGainNodeに接続

  // 再生が終了したら、管理オブジェクトから参照を削除する
  source.onended = () => {
    // 参照が自分自身である場合のみクリアする（競合状態の防止）
    if (playingSources[soundKey] === source) {
      playingSources[soundKey] = null;
    }
  };

  source.start(0); // 遅延なく再生を開始
  playingSources[soundKey] = source; // 現在再生中の音源として保存
}

/**
 * 指定された時間（ミリ秒）だけ処理を待機する
 * @param {number} ms 待機する時間
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * localStorageからランキングを読み込む
 * @returns {Array} ランキングデータの配列
 */
function loadRanking() {
  const rankingJSON = localStorage.getItem(RANKING_KEY);
  return rankingJSON ? JSON.parse(rankingJSON) : [];
}

/**
 * ランキングを画面に表示する
 * @param {number|null} newScore 強調表示する新しいスコア
 */
function displayRanking(newScore = null) {
  const ranking = loadRanking();
  dom.rankingList.innerHTML = "";

  for (let i = 0; i < RANKING_SIZE; i++) {
    const li = document.createElement("li");
    const rank = `${i + 1}.`;
    const scoreData = ranking[i];

    if (scoreData) {
      li.innerHTML = `<span>${rank}</span> <span>${scoreData.score}</span>`;
      if (scoreData.score === newScore) {
        li.classList.add("new-record");
      }
    } else {
      li.innerHTML = `<span>${rank}</span> <span>-</span>`;
    }
    dom.rankingList.appendChild(li);
  }
}

/**
 * 100個の音符をランダムに生成する関数
 */
function generateNotes() {
  gameState.sequence = [];
  for (let i = 0; i < gameState.notesCount; i++) {
    const type = NOTE_TYPES[Math.floor(Math.random() * NOTE_TYPES.length)];
    gameState.sequence.push(type);
  }
}

/**
 * 画面に音符を描画する関数
 */
function renderNotes() {
  dom.notesDisplay.innerHTML = ""; // 既存の音符をクリア
  const fragment = document.createDocumentFragment();
  // 全ての音符を一度に描画する
  gameState.sequence.forEach((noteType, index) => {
    const noteElement = document.createElement("div");
    noteElement.classList.add("note", noteType);
    noteElement.style.zIndex = gameState.notesCount - index; // 先頭の音符ほど手前に表示する
    // noteElement.textContent = noteType === "don" ? "ド" : "カ";
    fragment.appendChild(noteElement);
  });
  dom.notesDisplay.appendChild(fragment);

  // 残り音符数を更新
  updateRemainingNotes();
}

/**
 * タイマー表示を更新する関数
 */
function updateTimer() {
  const elapsedTime = Date.now() - gameState.startTime;
  dom.timerDisplay.textContent = (elapsedTime / 1000).toFixed(2);
}

/**
 * 残り音符数表示を更新する関数
 */
function updateRemainingNotes() {
  dom.remainingNotesDisplay.textContent =
    gameState.notesCount - gameState.currentIndex;
}

/**
 * プログレスバーの表示を更新する関数
 */
function updateProgressBar() {
  const progress = (gameState.currentIndex / gameState.notesCount) * 100;
  dom.progressBar.style.width = `${progress}%`;
}

/**
 * 現在のハイスピード設定に基づいて、ノート1つあたりのオフセット幅を計算する
 * @returns {number}
 */
function getNoteOffset() {
  // CSSから値を取得して計算することで、一元管理する
  const noteWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--note-width")
  );
  const noteBorderWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--note-border-width"
    )
  );
  const baseWidth = noteWidth + noteBorderWidth * 2;
  const noteMargin = -5 + (gameState.hiSpeed - 1.0) * 50;
  return baseWidth + noteMargin * 2;
}

/**
 * ハイスピード設定を更新し、UIと譜面表示に適用する
 * @param {number} newSpeed 新しいハイスピード値
 */
function updateHiSpeed(newSpeed) {
  // 0.1から5.0の範囲に制限
  gameState.hiSpeed = Math.max(0.1, Math.min(newSpeed, 5.0));
  const speed = gameState.hiSpeed.toFixed(1);

  // UI表示を更新
  dom.speedDisplay.textContent = speed;

  // --- 譜面の開始位置を計算して更新 ---
  const targetCenter = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--target-indicator-left"
    )
  );
  const noteOffset = getNoteOffset();
  const startLeft = targetCenter - noteOffset / 2;
  document.documentElement.style.setProperty(
    "--notes-display-left",
    `${startLeft}px`
  );

  // CSSのカスタムプロパティを更新して、音符の間隔を変更
  document.documentElement.style.setProperty(
    "--note-margin-horizontal",
    `${-5 + (speed - 1.0) * 50}px`
  );

  // 設定をlocalStorageに保存
  localStorage.setItem(HISPEED_KEY, speed);

  // ゲームプレイ中にハイスピードが変更された場合、譜面のスクロール位置を即座に再計算する
  if (gameState.isActive) {
    // 一時的にアニメーションを無効化して、transformを即座に適用する
    dom.notesDisplay.style.transition = "none";
    dom.notesDisplay.style.transform = `translateX(${-(
      gameState.currentIndex * getNoteOffset()
    )}px)`;

    // ブラウザに強制的にスタイルを適用させる（リフロー）
    dom.notesDisplay.offsetHeight; // この行は重要です

    // アニメーションを元に戻す
    dom.notesDisplay.style.transition = "";
  }
}

/**
 * ノーツ数設定を更新し、UIに適用する
 * @param {number} newCount 新しいノーツ数
 */
function updateNotesCount(newCount) {
  // 10から999の範囲に制限
  gameState.notesCount = Math.max(10, Math.min(newCount, 999));

  // UI表示を更新
  dom.notesCountInput.value = gameState.notesCount;
  dom.remainingNotesDisplay.textContent = gameState.notesCount; // 残り表示も更新

  // 設定をlocalStorageに保存
  localStorage.setItem(NOTES_COUNT_KEY, gameState.notesCount);
}

/**
 * 音量を更新し、UIと設定に適用する
 * @param {number} newVolume 新しい音量 (0.0 to 1.0)
 * @param {boolean} save 設定を保存するかどうか
 */
function updateVolume(newVolume, save = true) {
  gameState.volume = Math.max(0.0, Math.min(newVolume, 1.0));

  if (masterGainNode) {
    masterGainNode.gain.value = gameState.volume;
  }

  dom.volumeSlider.value = gameState.volume;
  dom.volumeDisplay.textContent = Math.round(gameState.volume * 100);

  if (save) {
    localStorage.setItem(VOLUME_KEY, gameState.volume);
  }
}

/**
 * ノートスクロールのアニメーション速度を更新する
 * @param {number} newDuration 新しいアニメーション時間 (秒)
 * @param {boolean} save 設定を保存するかどうか
 */
function updateAnimationSpeed(newDuration, save = true) {
  const duration = Math.max(0.0, Math.min(newDuration, 0.3)).toFixed(2);

  document.documentElement.style.setProperty(
    "--note-scroll-duration",
    `${duration}s`
  );
  dom.animationSpeedSlider.value = duration;
  dom.animationSpeedDisplay.textContent = duration;

  if (save) {
    localStorage.setItem(ANIMATION_SPEED_KEY, duration);
  }
}
/**
 * ゲームを開始する関数
 */
async function startGame() {
  // 多重起動を防止
  if (gameState.isStarting || gameState.isActive) return;
  gameState.isStarting = true;

  // AudioContextを初期化（ユーザーの初回アクション時）
  initAudioContext();

  // 音声がまだ読み込まれていない場合は、読み込んでからゲームを開始
  if (!isAudioLoaded) {
    dom.startButton.textContent = "Loading";
    await loadAllAudio();
    dom.startButton.textContent = "Start";
    // このまま処理を続行させる（再帰呼び出しをなくす）
  }

  // --- アニメーションを無効にして、譜面の位置を即座にリセット ---
  dom.notesDisplay.style.transition = "none";
  dom.notesDisplay.style.transform = "translateX(0px)";
  // ブラウザに強制的にスタイルを適用させるための小技（リフロー）
  dom.notesDisplay.offsetHeight; // この行は重要です
  dom.notesDisplay.style.transition = ""; // transitionの設定を元に戻す

  // UIの更新（ボタンなどを先に隠す）
  dom.startButton.disabled = true;
  dom.bottomWrapper.classList.add("hidden");

  // --- カウントダウン処理 ---
  dom.countdownDisplay.classList.remove("hidden");
  // transitionを元に戻しておく（中断->再開のケースを考慮）
  dom.countdownDisplay.style.transition = "";
  playSound("countdown");
  dom.countdownDisplay.textContent = "3";
  await sleep(COUNTDOWN_INTERVAL);
  playSound("countdown");
  dom.countdownDisplay.textContent = "2";
  await sleep(COUNTDOWN_INTERVAL);
  playSound("countdown");
  dom.countdownDisplay.textContent = "1";
  await sleep(COUNTDOWN_INTERVAL);

  // 「1」が消えるときだけアニメーションを無効にして即座に非表示にする
  dom.countdownDisplay.style.transition = "none";
  dom.countdownDisplay.classList.add("hidden");

  // ゲーム状態のリセット
  gameState.isActive = true;
  gameState.isStarting = false; // スタート処理完了
  gameState.currentIndex = 0;
  gameState.missCount = 0;
  dom.missDisplay.textContent = gameState.missCount; // ミス表示をリセット
  updateProgressBar(); // プログレスバーをリセット
  generateNotes();
  renderNotes();

  // タイマーを開始
  gameState.startTime = Date.now();
  timerInterval = setInterval(updateTimer, 10);

  // キー入力のイベントリスナーを設定
  document.addEventListener("keydown", handleKeyPress);
}

/**
 * キー入力の処理を行う関数
 * @param {KeyboardEvent} event
 */
function handleKeyPress(event) {
  if (!gameState.isActive) return; // ゲームがアクティブでなければ何もしない

  const key = event.key.toLowerCase();
  if (!keyMap[key]) return; // 対象キーでなければ無視

  const expectedNoteType = gameState.sequence[gameState.currentIndex];
  const pressedNoteType = keyMap[key];

  if (pressedNoteType === expectedNoteType) {
    // --- 正しいキーが押された場合 ---
    playSound(expectedNoteType); // "don" または "ka" の音を再生

    // ターゲットサークルを光らせる
    dom.targetIndicator.classList.add("hit-effect");
    setTimeout(() => {
      dom.targetIndicator.classList.remove("hit-effect");
    }, 200); // アニメーションの時間（0.2秒）に合わせてクラスを削除

    // 叩かれた音符の要素を取得して非表示にするクラスを追加
    const hitNoteElement = dom.notesDisplay.children[gameState.currentIndex];
    if (hitNoteElement) {
      hitNoteElement.classList.add("hit");
    }
    gameState.currentIndex++;

    dom.notesDisplay.style.transform = `translateX(${-(
      gameState.currentIndex * getNoteOffset()
    )}px)`;
    updateRemainingNotes();
    updateProgressBar();
  } else {
    // --- 間違ったキーが押された場合 ---
    playSound("miss"); // ミス音を再生
    gameState.missCount++;
    dom.missDisplay.textContent = gameState.missCount; // ミス表示を更新
    gameState.startTime -= MISS_PENALTY_TIME; // 開始時間を遅らせることでペナルティを加算
    // 画面を赤くフラッシュさせるなどの視覚的フィードバック
    document.body.style.backgroundColor = "#034";
    setTimeout(() => {
      document.body.style.backgroundColor = "#023";
    }, 100);
  }

  // --- ゲーム終了判定 ---
  if (gameState.currentIndex >= gameState.notesCount) {
    endGame();
  }
}

/**
 * ゲームを終了する関数
 */
function endGame() {
  gameState.isActive = false;
  clearInterval(timerInterval); // タイマーを停止
  document.removeEventListener("keydown", handleKeyPress); // イベントリスナーを削除
  playSound("clear"); // クリア音を再生

  const finalTime = (Date.now() - gameState.startTime) / 1000;
  const kps = gameState.notesCount / finalTime;

  // 新しいスコア計算 (KPSベース方式)
  const accuracy =
    (gameState.notesCount - gameState.missCount) / gameState.notesCount;
  const score = Math.round(kps * accuracy ** 3 * 10000);

  // --- ランキングの更新処理（ノーツ数が100以上の場合のみ） ---
  if (gameState.notesCount >= 100) {
    const ranking = loadRanking();
    ranking.push({ score });
    // スコアで降順にソートし、上位5件に絞る
    const newRanking = ranking
      .sort((a, b) => b.score - a.score)
      .slice(0, RANKING_SIZE);
    // localStorageに保存
    localStorage.setItem(RANKING_KEY, JSON.stringify(newRanking));
    displayRanking(score); // 更新後のランキングを表示（新スコアを強調）
  }

  // 結果を表示
  dom.finalScoreDisplay.textContent = score; // スコアをセット
  dom.clearTimeDisplay.textContent = finalTime.toFixed(2); // 実タイムをセット
  dom.penaltyCountDisplay.textContent = gameState.missCount;
  dom.kpsDisplay.textContent = kps.toFixed(2); // 打/秒をセット
  dom.bottomWrapper.classList.remove("hidden");
  dom.startButton.disabled = false; // 再挑戦できるようにボタンを有効化
}

// --- イベントリスナーの設定 ---
dom.startButton.addEventListener("click", startGame);

// Enterでゲーム開始、Escで中断するグローバルなキーイベント
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    if (gameState.isActive) {
      // ゲーム中にEnterが押されたら、中断して即座にリスタート
      interruptGame(false); // 中断音を鳴らさずに中断
      startGame();
    } else if (!gameState.isStarting) {
      startGame();
    }
  }

  // Escapeキーでゲームを中断（ゲーム中のみ）
  if (event.key === "Escape" && gameState.isActive) {
    interruptGame();
  }
});

/**
 * ゲームを中断する関数
 */
function interruptGame(playCancelSound = true) {
  if (!gameState.isActive) return;
  if (playCancelSound) playSound("cancel"); // 中断音を再生

  gameState.isActive = false;
  gameState.isStarting = false; // スタート処理中だった場合もリセット
  clearInterval(timerInterval); // タイマーを停止
  document.removeEventListener("keydown", handleKeyPress); // イベントリスナーを削除

  // UIを初期状態に戻す
  dom.timerDisplay.textContent = "0.00";
  dom.remainingNotesDisplay.textContent = gameState.notesCount;
  dom.missDisplay.textContent = 0; // ミス表示をリセット
  dom.progressBar.style.width = "0%"; // プログレスバーをリセット

  // アニメーションを無効にして譜面を即座にクリア
  dom.notesDisplay.style.transition = "none";
  dom.notesDisplay.style.transform = "translateX(0px)";
  dom.notesDisplay.innerHTML = "";
  dom.notesDisplay.style.transition = "";

  dom.bottomWrapper.classList.add("hidden");
  dom.startButton.textContent = "Start";
  dom.startButton.disabled = false;

  // ミスした時の背景色をリセット
  document.body.style.backgroundColor = "#023";
}

/**
 * キー設定を更新し、UIとlocalStorageに保存する
 * @param {object} newConfig 新しいキー設定オブジェクト
 */
function updateKeyConfig(newConfig) {
  gameState.keyConfig = { ...gameState.keyConfig, ...newConfig };

  // 逆引きマップを再生成
  keyMap = {};
  keyMap[gameState.keyConfig.don_left] = "don";
  keyMap[gameState.keyConfig.don_right] = "don";
  keyMap[gameState.keyConfig.ka_left] = "ka";
  keyMap[gameState.keyConfig.ka_right] = "ka";

  // UIの表示を更新
  for (const action in gameState.keyConfig) {
    const button = document.querySelector(
      `.key-config-btn[data-action="${action}"]`
    );
    if (button) {
      button.textContent = gameState.keyConfig[action].toUpperCase();
    }
  }

  // localStorageに保存
  localStorage.setItem(KEY_CONFIG_KEY, JSON.stringify(gameState.keyConfig));
}

/**
 * デフォルトのキー設定に戻す
 */
function resetKeyConfigToDefault() {
  const defaultConfig = {
    don_left: "f",
    don_right: "j",
    ka_left: "d",
    ka_right: "k",
  };
  updateKeyConfig(defaultConfig);
}

// --- 初期化処理 ---
function initialize() {
  const savedSpeed = parseFloat(localStorage.getItem(HISPEED_KEY)) || 1.0;
  const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "0.25");
  const savedNotesCount =
    parseInt(localStorage.getItem(NOTES_COUNT_KEY)) || 100;
  const savedAnimationSpeed =
    parseFloat(localStorage.getItem(ANIMATION_SPEED_KEY)) || 0.1;
  const savedKeyConfig =
    JSON.parse(localStorage.getItem(KEY_CONFIG_KEY)) || gameState.keyConfig;

  updateVolume(savedVolume, false); // UIと内部状態のみ更新
  updateNotesCount(savedNotesCount);
  updateHiSpeed(savedSpeed);
  updateAnimationSpeed(savedAnimationSpeed, false);
  displayRanking(); // ページ読み込み時にランキングを表示
  updateKeyConfig(savedKeyConfig); // 保存されたキー設定を読み込む

  // バージョン番号を表示
  dom.versionDisplay.textContent = VERSION;

  // ハイスピードボタンのイベントリスナー
  dom.speedUpBtn.addEventListener("click", () => {
    updateHiSpeed(gameState.hiSpeed + 0.1);
  });
  dom.speedDownBtn.addEventListener("click", () => {
    updateHiSpeed(gameState.hiSpeed - 0.1);
  });

  // ノーツ数入力欄のイベントリスナー
  dom.notesCountInput.addEventListener("change", (event) => {
    if (gameState.isActive) {
      // ゲーム中は変更を元に戻す
      event.target.value = gameState.notesCount;
      return;
    }
    updateNotesCount(parseInt(event.target.value, 10));
  });

  // 音量スライダーのイベントリスナー
  dom.volumeSlider.addEventListener("input", (event) => {
    updateVolume(parseFloat(event.target.value));
  });

  // アニメーション速度スライダーのイベントリスナー
  dom.animationSpeedSlider.addEventListener("input", (event) => {
    updateAnimationSpeed(parseFloat(event.target.value));
  });
}

/**
 * 音声設定UIの表示を更新する（カスタム音声が設定されているかを表示）
 */
function updateSoundSettingsUI() {
  dom.soundFileInputs.forEach((input) => {
    const soundKey = input.dataset.soundKey;
    const label = input.closest(".setting-item").querySelector("label");
    const statusSpan = label.querySelector(".sound-status");
    const resetButton = input
      .closest(".setting-item")
      .querySelector(".reset-single-sound-btn");

    if (statusSpan) {
      const customSound = localStorage.getItem(
        CUSTOM_SOUND_KEY_PREFIX + soundKey
      );
      statusSpan.textContent = customSound ? "(Custom)" : "";
      resetButton.classList.toggle("hidden", !customSound);
    }
  });
}

/**
 * ファイルをData URLに変換する
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * カスタム音声ファイルが選択された時の処理
 * @param {Event} event
 */
async function handleSoundFileChange(event) {
  const file = event.target.files[0];
  const soundKey = event.target.dataset.soundKey;
  if (!file || !soundKey) return;

  try {
    // AudioContextが初期化/一時停止されている場合に対応する
    initAudioContext();
    if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
      console.log("AudioContext resumed by user action.");
    }

    // ファイルをData URLに変換してlocalStorageに保存
    const dataUrl = await fileToDataUrl(file);
    localStorage.setItem(CUSTOM_SOUND_KEY_PREFIX + soundKey, dataUrl);

    // 即座に音声をリロードして適用
    const response = await fetch(dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffers[soundKey] = await audioContext.decodeAudioData(arrayBuffer);

    // UIの表示を更新
    updateSoundSettingsUI();
  } catch (e) {
    console.error("Error processing sound file:", e);
    alert("An error occurred while processing the audio file.");
  }
}

/**
 * カスタム音声設定をすべてリセットする
 */
function resetCustomSounds() {
  Object.keys(AUDIO_FILES).forEach((key) => {
    localStorage.removeItem(CUSTOM_SOUND_KEY_PREFIX + key);
  });
  // UIの表示を更新
  updateSoundSettingsUI();

  alert(
    "Sounds have been reset to default. Please reload the page to apply the changes."
  );
}

/**
 * 個別のカスタム音声設定をリセットする
 * @param {string} soundKey
 */
async function resetSingleSound(soundKey) {
  // localStorageから削除
  localStorage.removeItem(CUSTOM_SOUND_KEY_PREFIX + soundKey);

  // デフォルト音声を再読み込みしてバッファを上書き
  try {
    audioBuffers[soundKey] = await loadAudio(AUDIO_FILES[soundKey]);
    console.log(`Reset sound for ${soundKey} to default.`);
  } catch (e) {
    console.error(`Failed to reload default sound for ${soundKey}:`, e);
  }

  // UIを更新
  updateSoundSettingsUI();
}

// --- 設定パネルのイベントリスナー ---
dom.openSettingsBtn.addEventListener("click", () => {
  updateSoundSettingsUI(); // パネルを開くときにUIを更新
  dom.settingsPanel.style.display = "block";
});
dom.closeSettingsBtn.addEventListener("click", () => {
  dom.settingsPanel.style.display = "none";
});
dom.soundFileInputs.forEach((input) => {
  input.addEventListener("change", handleSoundFileChange);
});
dom.resetSoundsBtn.addEventListener("click", resetCustomSounds);
dom.singleResetSoundBtns.forEach((button) => {
  button.addEventListener("click", (event) => {
    resetSingleSound(event.target.dataset.soundKey);
  });
});

// --- 高度な設定パネルのイベントリスナー ---
dom.openAdvancedSettingsBtn.addEventListener("click", () => {
  dom.advancedSettingsPanel.style.display = "block";
});
dom.closeAdvancedSettingsBtn.addEventListener("click", () => {
  dom.advancedSettingsPanel.style.display = "none";
});

// ランキングリセットボタンのイベントリスナー
dom.resetRankingBtn.addEventListener("click", () => {
  // 英語で確認ダイアログを表示
  if (confirm("Are you sure you want to reset the ranking?")) {
    localStorage.removeItem(RANKING_KEY); // localStorageからランキングデータを削除
    displayRanking(); // ランキング表示を更新して空にする
  }
});

// --- ヘルプパネルのイベントリスナー ---
dom.openHelpBtn.addEventListener("click", () => {
  dom.helpPanel.style.display = "block";
});
dom.closeHelpBtn.addEventListener("click", () => {
  dom.helpPanel.style.display = "none";
});

// --- キーコンフィグパネルのイベントリスナー ---
dom.resetKeyConfigBtn.addEventListener("click", resetKeyConfigToDefault);

document.querySelectorAll(".key-config-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    button.textContent = "..."; // 入力待ち状態を示す
    button.style.borderColor = "#ffc107";

    const handleKeyAssignment = (e) => {
      e.preventDefault();
      window.removeEventListener("keydown", handleKeyAssignment, {
        capture: true,
      });
      button.style.borderColor = ""; // ボーダー色を元に戻す

      // 修飾キーや特殊キーは無視
      if (e.key.length > 1 && e.key !== " ") {
        updateKeyConfig({}); // UI表示を元に戻すため空のオブジェクトで更新
        return;
      }

      const newKey = e.key.toLowerCase();

      // 他のアクションで既に使用されているかチェック
      for (const act in gameState.keyConfig) {
        if (gameState.keyConfig[act] === newKey && act !== action) {
          alert(
            `Key "${newKey.toUpperCase()}" is already assigned to another action.`
          );
          updateKeyConfig({}); // UI表示を元に戻す
          return;
        }
      }

      // 新しいキーを設定
      updateKeyConfig({ [action]: newKey });
    };

    window.addEventListener("keydown", handleKeyAssignment, { capture: true });
  });
});

// --- すべての準備が整ったので、初期化処理を実行 ---
initialize();
