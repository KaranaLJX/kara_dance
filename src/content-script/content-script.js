const ROOT_ID = "dance-helper-root";
const STYLE_ID = "dance-helper-style";
const STORAGE_PREFIX = "dance-helper-markers:";
const HISTORY_PREFIX = "dance-helper-history:";
const SETTINGS_KEY = "danceHelperSettings";
const SPEED_STEPS = [0.3, 0.5, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2];

const state = {
  url: location.href,
  markers: [],
  history: [],
  loopEnabled: false,
  selectedSegmentIndex: -1,
  panelVisible: true,
  panelCollapsed: true,
  videoKey: "",
  mounted: false,
  abStart: null,
  abEnd: null,
  activeHistoryId: ""
};

function isBilibiliPage() {
  return location.host.includes("bilibili.com");
}

function getVideoElement() {
  const videos = Array.from(document.querySelectorAll("video"));
  return videos.find((video) => Number.isFinite(video.duration) || video.readyState > 0) || videos[0] || null;
}

function getVideoTitle() {
  const title = document.querySelector("h1");
  return (title && title.textContent && title.textContent.trim()) || document.title || "Bilibili 视频";
}

function getVideoKey() {
  const path = location.pathname;
  const matchedId = path.match(/(BV[\w]+|av\d+|ep\d+|ss\d+)/i);
  return matchedId ? matchedId[1].toUpperCase() : `${location.host}${path}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, secs]
      .map((value, index) => String(value).padStart(index === 0 ? 1 : 2, "0"))
      .join(":");
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function normalizeMarkers(markers) {
  return [...new Set(markers.map((value) => Number(value.toFixed(1))))]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
}

function normalizeHistory(history) {
  return (history || [])
    .map((item, index) => {
      const start = Number(item.start);
      const end = Number(item.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(end - start) < 0.1) {
        return null;
      }

      const normalizedStart = Math.max(0, Math.min(start, end));
      const normalizedEnd = Math.max(normalizedStart, Math.max(start, end));
      return {
        id: item.id || `${Date.now()}-${index}`,
        start: Number(normalizedStart.toFixed(1)),
        end: Number(normalizedEnd.toFixed(1)),
        createdAt: Number(item.createdAt) || Date.now(),
        title: item.title || getVideoTitle(),
        videoKey: item.videoKey || state.videoKey || getVideoKey(),
        url: item.url || location.href
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getABRange() {
  if (!Number.isFinite(state.abStart) || !Number.isFinite(state.abEnd)) {
    return null;
  }

  const start = Math.min(state.abStart, state.abEnd);
  const end = Math.max(state.abStart, state.abEnd);
  if (end - start < 0.1) {
    return null;
  }

  return {
    start: Number(start.toFixed(1)),
    end: Number(end.toFixed(1))
  };
}

async function saveMarkers() {
  if (!state.videoKey) {
    return;
  }

  await chrome.storage.local.set({
    [`${STORAGE_PREFIX}${state.videoKey}`]: state.markers
  });
}

async function saveHistory() {
  if (!state.videoKey) {
    return;
  }

  await chrome.storage.local.set({
    [`${HISTORY_PREFIX}${state.videoKey}`]: state.history
  });
}

async function saveSettings() {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      panelVisible: state.panelVisible,
      panelCollapsed: state.panelCollapsed
    }
  });
}

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = result ? result[SETTINGS_KEY] : null;
  state.panelVisible = settings && typeof settings.panelVisible === "boolean" ? settings.panelVisible : true;
  state.panelCollapsed =
    settings && typeof settings.panelCollapsed === "boolean" ? settings.panelCollapsed : true;
}

async function loadMarkers() {
  state.videoKey = getVideoKey();
  const storageKey = `${STORAGE_PREFIX}${state.videoKey}`;
  const result = await chrome.storage.local.get(storageKey);
  state.markers = normalizeMarkers((result && result[storageKey]) || []);
  state.selectedSegmentIndex = clampSegmentIndex(state.selectedSegmentIndex);
}

async function loadHistory() {
  state.videoKey = getVideoKey();
  const storageKey = `${HISTORY_PREFIX}${state.videoKey}`;
  const result = await chrome.storage.local.get(storageKey);
  state.history = normalizeHistory((result && result[storageKey]) || []);
}

function getCurrentSegmentIndex() {
  const video = getVideoElement();
  if (!video || state.markers.length < 2) {
    return -1;
  }

  const currentTime = video.currentTime;
  for (let index = 0; index < state.markers.length - 1; index += 1) {
    if (currentTime >= state.markers[index] && currentTime < state.markers[index + 1]) {
      return index;
    }
  }

  if (currentTime < state.markers[0]) {
    return 0;
  }

  return state.markers.length - 2;
}

function clampSegmentIndex(index) {
  if (state.markers.length < 2) {
    return -1;
  }

  return Math.max(0, Math.min(index, state.markers.length - 2));
}

function getMarkerSegment() {
  const segmentIndex =
    state.selectedSegmentIndex >= 0 ? state.selectedSegmentIndex : getCurrentSegmentIndex();

  if (segmentIndex < 0 || state.markers.length < 2) {
    return null;
  }

  return {
    type: "marker",
    index: segmentIndex,
    start: state.markers[segmentIndex],
    end: state.markers[segmentIndex + 1]
  };
}

function getLoopRange() {
  const abRange = getABRange();
  if (abRange) {
    return {
      type: "ab",
      start: abRange.start,
      end: abRange.end
    };
  }

  return getMarkerSegment();
}

function seekTo(seconds) {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  video.currentTime = Math.max(0, seconds);
  return true;
}

function setPlaybackRate(rate) {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  video.playbackRate = Math.min(2, Math.max(0.1, rate));
  return true;
}

function changePlaybackRate(direction) {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  let index = SPEED_STEPS.findIndex((value) => value >= video.playbackRate - 0.001);
  if (index < 0) {
    index = SPEED_STEPS.length - 1;
  }

  index += direction;
  index = Math.max(0, Math.min(index, SPEED_STEPS.length - 1));
  return setPlaybackRate(SPEED_STEPS[index]);
}

function togglePlay() {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  if (video.paused) {
    video.play().catch(() => undefined);
  } else {
    video.pause();
  }

  return true;
}

async function addMarker() {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  state.markers = normalizeMarkers([...state.markers, video.currentTime]);
  await saveMarkers();
  updatePanel();
  return true;
}

async function removeMarker(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.markers.length) {
    return false;
  }

  state.markers.splice(index, 1);
  state.markers = normalizeMarkers(state.markers);
  state.selectedSegmentIndex = clampSegmentIndex(state.selectedSegmentIndex);
  await saveMarkers();
  updatePanel();
  return true;
}

async function clearMarkers() {
  state.markers = [];
  state.selectedSegmentIndex = -1;
  if (!getABRange()) {
    state.loopEnabled = false;
  }
  await saveMarkers();
  updatePanel();
  return true;
}

function jumpMarker(direction) {
  const video = getVideoElement();
  if (!video || !state.markers.length) {
    return false;
  }

  const currentTime = video.currentTime;
  let target = null;

  if (direction < 0) {
    for (let index = state.markers.length - 1; index >= 0; index -= 1) {
      if (state.markers[index] < currentTime - 0.2) {
        target = state.markers[index];
        break;
      }
    }
    if (target === null) {
      target = state.markers[0];
    }
  } else {
    for (let index = 0; index < state.markers.length; index += 1) {
      if (state.markers[index] > currentTime + 0.2) {
        target = state.markers[index];
        break;
      }
    }
    if (target === null) {
      target = state.markers[state.markers.length - 1];
    }
  }

  return seekTo(target);
}

function setABPoint(type) {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  if (type === "start") {
    state.abStart = Number(video.currentTime.toFixed(1));
    state.activeHistoryId = "";
  } else {
    state.abEnd = Number(video.currentTime.toFixed(1));
    state.activeHistoryId = "";
  }

  updatePanel();
  return true;
}

function setABPointFromMarker(type, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.markers.length) {
    return false;
  }

  const marker = state.markers[index];
  if (!Number.isFinite(marker)) {
    return false;
  }

  if (type === "start") {
    state.abStart = marker;
  } else {
    state.abEnd = marker;
  }

  state.activeHistoryId = "";
  updatePanel();
  return true;
}

function clearABPoints() {
  state.abStart = null;
  state.abEnd = null;
  state.activeHistoryId = "";
  if (!getMarkerSegment()) {
    state.loopEnabled = false;
  }
  updatePanel();
  return true;
}

async function saveCurrentABSegment() {
  const range = getABRange();
  if (!range) {
    return false;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    start: range.start,
    end: range.end,
    createdAt: Date.now(),
    title: getVideoTitle(),
    videoKey: state.videoKey || getVideoKey(),
    url: location.href
  };

  state.history = normalizeHistory([entry, ...state.history]);
  state.activeHistoryId = entry.id;
  await saveHistory();
  updatePanel();
  return true;
}

function findHistoryIndexById(entryId) {
  if (!entryId) {
    return -1;
  }

  return state.history.findIndex((item) => item.id === entryId);
}

function selectHistorySegment(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.history.length) {
    return false;
  }

  const item = state.history[index];
  state.abStart = item.start;
  state.abEnd = item.end;
  state.activeHistoryId = item.id;
  updatePanel();
  return true;
}

function seekHistorySegment(index) {
  if (!selectHistorySegment(index)) {
    return false;
  }
  return seekTo(state.history[index].start);
}

function loadHistorySegment(payload) {
  const start = Number(payload && payload.start);
  const end = Number(payload && payload.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(end - start) < 0.1) {
    return false;
  }

  state.abStart = Number(Math.min(start, end).toFixed(1));
  state.abEnd = Number(Math.max(start, end).toFixed(1));
  state.activeHistoryId = (payload && payload.entryId) || "";
  updatePanel();
  return seekTo(state.abStart);
}

async function removeHistorySegment(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.history.length) {
    return false;
  }

  const removed = state.history[index];
  state.history.splice(index, 1);
  if (removed && removed.id === state.activeHistoryId) {
    state.activeHistoryId = "";
  }
  state.history = normalizeHistory(state.history);
  await saveHistory();
  updatePanel();
  return true;
}

async function clearHistory() {
  state.history = [];
  state.activeHistoryId = "";
  await saveHistory();
  updatePanel();
  return true;
}

function toggleLoop() {
  const range = getLoopRange();
  if (!range) {
    return false;
  }

  if (range.type === "marker") {
    state.selectedSegmentIndex = range.index;
  }
  state.loopEnabled = !state.loopEnabled;
  updatePanel();
  return true;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 336px;
      font-family: Arial, sans-serif;
      color: #101828;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    #${ROOT_ID}.hidden {
      display: none;
    }
    #${ROOT_ID}.collapsed {
      width: auto;
    }
    #${ROOT_ID} .launcher {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 46px;
      height: 46px;
      border-radius: 999px;
      border: 0;
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.22);
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      padding: 0 12px;
      white-space: nowrap;
    }
    #${ROOT_ID}.collapsed .launcher {
      min-width: 52px;
      padding: 0 14px;
    }
    #${ROOT_ID} .panel-shell {
      width: 336px;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #${ROOT_ID}.collapsed .panel-shell {
      opacity: 0;
      pointer-events: none;
      transform: translateX(12px) scale(0.98);
      width: 0;
      overflow: hidden;
    }
    #${ROOT_ID} .panel {
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }
    #${ROOT_ID} .header {
      padding: 14px 16px 8px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    #${ROOT_ID} .header-main {
      min-width: 0;
      flex: 1;
    }
    #${ROOT_ID} .title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    #${ROOT_ID} .subtitle {
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.9;
    }
    #${ROOT_ID} .header-toggle {
      width: auto;
      min-width: 32px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      font-size: 16px;
      line-height: 1;
    }
    #${ROOT_ID} .header-toggle:hover {
      background: rgba(255, 255, 255, 0.24);
    }
    #${ROOT_ID} .body {
      padding: 12px 16px 16px;
    }
    #${ROOT_ID} .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    #${ROOT_ID} .stat {
      padding: 10px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12px;
    }
    #${ROOT_ID} .stat strong {
      display: block;
      margin-top: 4px;
      font-size: 14px;
    }
    #${ROOT_ID} .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    #${ROOT_ID} button {
      border: 0;
      border-radius: 10px;
      padding: 10px 8px;
      background: #1d4ed8;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
    }
    #${ROOT_ID} button.secondary {
      background: #0f172a;
    }
    #${ROOT_ID} button.danger {
      background: #dc2626;
    }
    #${ROOT_ID} .section {
      margin-top: 12px;
    }
    #${ROOT_ID} .section-title {
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
    }
    #${ROOT_ID} .ab-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    #${ROOT_ID} .ab-item {
      padding: 8px 10px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12px;
    }
    #${ROOT_ID} .marker-list,
    #${ROOT_ID} .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 180px;
      overflow-y: auto;
    }
    #${ROOT_ID} .history-list {
      max-height: 160px;
    }
    #${ROOT_ID} .marker-item,
    #${ROOT_ID} .history-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12px;
    }
    #${ROOT_ID} .history-item {
      grid-template-columns: 1fr auto auto;
    }
    #${ROOT_ID} .marker-item {
      grid-template-columns: 1fr auto auto auto auto;
    }
    #${ROOT_ID} .marker-item.active,
    #${ROOT_ID} .history-item.active {
      outline: 2px solid #2563eb;
    }
    #${ROOT_ID} .marker-item button,
    #${ROOT_ID} .history-item button {
      padding: 6px 8px;
      font-size: 12px;
    }
    #${ROOT_ID} .history-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #${ROOT_ID} .marker-main {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    #${ROOT_ID} .marker-badge {
      border-radius: 999px;
      padding: 2px 6px;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 10px;
      font-weight: 700;
    }
    #${ROOT_ID} .history-time {
      font-weight: 700;
    }
    #${ROOT_ID} .history-meta {
      color: #667085;
      font-size: 11px;
    }
    #${ROOT_ID} .empty {
      padding: 12px 8px;
      font-size: 12px;
      color: #667085;
      text-align: center;
      background: #f8fafc;
      border-radius: 10px;
    }
  `;

  document.documentElement.appendChild(style);
}

function ensureRoot() {
  ensureStyles();

  let root = document.getElementById(ROOT_ID);
  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <button class="launcher" data-action="toggle-panel" type="button">扒舞</button>
    <div class="panel-shell">
      <div class="panel">
        <div class="header">
          <div class="header-main">
            <div class="title">Caradance 扒舞助手</div>
            <div class="subtitle" data-role="subtitle">等待视频加载...</div>
          </div>
          <button class="header-toggle" data-action="toggle-panel" type="button" title="收起面板">-</button>
        </div>
        <div class="body">
          <div class="stats">
            <div class="stat">当前时间<strong data-role="current-time">--:--</strong></div>
            <div class="stat">播放速度<strong data-role="rate">x1.0</strong></div>
            <div class="stat">打点数<strong data-role="marker-count">0</strong></div>
            <div class="stat">循环范围<strong data-role="loop">关闭</strong></div>
          </div>
          <div class="buttons">
            <button data-action="toggle-play">播放/暂停</button>
            <button data-action="add-marker">记录打点</button>
            <button data-action="toggle-loop">开始循环</button>
            <button data-action="jump-previous">上一个点</button>
            <button data-action="jump-next">下一个点</button>
            <button data-action="toggle-panel">收起面板</button>
            <button data-action="slower">减速</button>
            <button data-action="faster">加速</button>
            <button class="danger" data-action="clear-markers">清空打点</button>
          </div>
          <div class="section">
            <div class="section-title">A / B 点</div>
            <div class="ab-row">
              <div class="ab-item">A 点：<strong data-role="ab-start">未设置</strong></div>
              <div class="ab-item">B 点：<strong data-role="ab-end">未设置</strong></div>
            </div>
            <div class="buttons">
              <button data-action="set-ab-start">设置 A 点</button>
              <button data-action="set-ab-end">设置 B 点</button>
              <button data-action="save-ab-history">保存片段</button>
              <button class="secondary" data-action="clear-ab">清空 A/B</button>
              <button class="secondary" data-action="seek-ab-start">跳到 A 点</button>
              <button class="danger" data-action="clear-history">清空历史</button>
            </div>
          </div>
          <div class="section">
            <div class="section-title">当前视频打点</div>
            <div class="marker-list" data-role="marker-list"></div>
          </div>
          <div class="section">
            <div class="section-title">历史片段</div>
            <div class="history-list" data-role="history-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (!action) {
      return;
    }

    const index = target.dataset.index;
    await performAction(action, {
      index: index === undefined ? undefined : Number(index)
    });
  });

  document.body.appendChild(root);
  return root;
}

function updatePanel() {
  const root = ensureRoot();
  root.classList.toggle("hidden", !state.panelVisible);
  root.classList.toggle("collapsed", state.panelCollapsed);

  const video = getVideoElement();
  const subtitle = root.querySelector('[data-role="subtitle"]');
  const currentTime = root.querySelector('[data-role="current-time"]');
  const rate = root.querySelector('[data-role="rate"]');
  const markerCount = root.querySelector('[data-role="marker-count"]');
  const loop = root.querySelector('[data-role="loop"]');
  const abStart = root.querySelector('[data-role="ab-start"]');
  const abEnd = root.querySelector('[data-role="ab-end"]');
  const markerList = root.querySelector('[data-role="marker-list"]');
  const historyList = root.querySelector('[data-role="history-list"]');
  const launcher = root.querySelector(".launcher");
  const headerToggle = root.querySelector(".header-toggle");

  subtitle.textContent = video ? getVideoTitle() : "当前页面未检测到视频";
  currentTime.textContent = video ? formatTime(video.currentTime) : "--:--";
  rate.textContent = video ? `x${video.playbackRate.toFixed(1)}` : "x1.0";
  markerCount.textContent = String(state.markers.length);
  abStart.textContent = Number.isFinite(state.abStart) ? formatTime(state.abStart) : "未设置";
  abEnd.textContent = Number.isFinite(state.abEnd) ? formatTime(state.abEnd) : "未设置";
  launcher.textContent = state.panelCollapsed ? "扒舞" : "收起";
  headerToggle.textContent = state.panelCollapsed ? "+" : "-";
  headerToggle.title = state.panelCollapsed ? "展开面板" : "收起面板";

  const range = getLoopRange();
  loop.textContent = state.loopEnabled && range ? formatRange(range.start, range.end) : "关闭";

  markerList.innerHTML = "";
  if (!state.markers.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "先暂停在动作关键帧，再点击“记录打点”。";
    markerList.appendChild(empty);
  } else {
    state.markers.forEach((marker, index) => {
      const item = document.createElement("div");
      item.className = "marker-item";
      if (
        state.selectedSegmentIndex >= 0 &&
        (index === state.selectedSegmentIndex || index === state.selectedSegmentIndex + 1)
      ) {
        item.classList.add("active");
      }

      const main = document.createElement("div");
      main.className = "marker-main";

      const time = document.createElement("strong");
      time.textContent = formatTime(marker);

      main.appendChild(time);

      if (Number.isFinite(state.abStart) && Math.abs(marker - state.abStart) < 0.05) {
        const badge = document.createElement("span");
        badge.className = "marker-badge";
        badge.textContent = "A";
        main.appendChild(badge);
      }

      if (Number.isFinite(state.abEnd) && Math.abs(marker - state.abEnd) < 0.05) {
        const badge = document.createElement("span");
        badge.className = "marker-badge";
        badge.textContent = "B";
        main.appendChild(badge);
      }

      const seek = document.createElement("button");
      seek.textContent = "跳转";
      seek.dataset.action = "seek-marker";
      seek.dataset.index = String(index);

      const setA = document.createElement("button");
      setA.textContent = "设A";
      setA.className = "secondary";
      setA.dataset.action = "set-marker-ab-start";
      setA.dataset.index = String(index);

      const setB = document.createElement("button");
      setB.textContent = "设B";
      setB.className = "secondary";
      setB.dataset.action = "set-marker-ab-end";
      setB.dataset.index = String(index);

      const remove = document.createElement("button");
      remove.textContent = "删除";
      remove.className = "danger";
      remove.dataset.action = "remove-marker";
      remove.dataset.index = String(index);

      item.append(main, seek, setA, setB, remove);
      markerList.appendChild(item);
    });
  }

  historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "保存过的 A/B 片段会出现在这里。";
    historyList.appendChild(empty);
    return;
  }

  state.history.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "history-item";
    if (item.id === state.activeHistoryId) {
      row.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "history-main";

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = formatRange(item.start, item.end);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = item.title;

    main.append(time, meta);

    const seek = document.createElement("button");
    seek.textContent = "回放";
    seek.dataset.action = "seek-history";
    seek.dataset.index = String(index);

    const remove = document.createElement("button");
    remove.textContent = "删除";
    remove.className = "danger";
    remove.dataset.action = "remove-history";
    remove.dataset.index = String(index);

    row.append(main, seek, remove);
    historyList.appendChild(row);
  });
}

function getState() {
  const video = getVideoElement();
  return {
    ok: true,
    isBilibili: isBilibiliPage(),
    hasVideo: Boolean(video),
    title: getVideoTitle(),
    url: location.href,
    currentTime: video ? video.currentTime : 0,
    duration: video ? video.duration : 0,
    playbackRate: video ? video.playbackRate : 1,
    paused: video ? video.paused : true,
    markers: state.markers,
    history: state.history,
    videoKey: state.videoKey,
    loopEnabled: state.loopEnabled,
    currentSegmentIndex: getCurrentSegmentIndex(),
    abStart: state.abStart,
    abEnd: state.abEnd
  };
}

async function performAction(type, payload) {
  const video = getVideoElement();
  if (!video && type !== "get-state" && type !== "toggle-panel") {
    return {
      ok: true,
      ...getState(),
      error: "当前页面没有检测到视频。"
    };
  }

  switch (type) {
    case "get-state":
      return getState();
    case "toggle-panel":
      state.panelVisible = true;
      state.panelCollapsed = !state.panelCollapsed;
      await saveSettings();
      updatePanel();
      return { ...getState(), message: state.panelCollapsed ? "面板已收起。" : "面板已展开。" };
    case "toggle-play":
      togglePlay();
      updatePanel();
      return { ...getState(), message: video.paused ? "已暂停。" : "已开始播放。" };
    case "add-marker":
      await addMarker();
      return { ...getState(), message: "已记录当前时间点。" };
    case "remove-marker":
      if (!(await removeMarker(payload.index))) {
        return { ...getState(), error: "删除失败，打点不存在。" };
      }
      return { ...getState(), message: "已删除打点。" };
    case "seek-marker":
      if (!Number.isInteger(payload.index) || !seekTo(state.markers[payload.index])) {
        return { ...getState(), error: "跳转失败。" };
      }
      updatePanel();
      return { ...getState(), message: "已跳转到打点。" };
    case "clear-markers":
      await clearMarkers();
      return { ...getState(), message: "当前视频打点已清空。" };
    case "jump-previous":
      if (!jumpMarker(-1)) {
        return { ...getState(), error: "没有可跳转的上一个点。" };
      }
      updatePanel();
      return { ...getState(), message: "已跳到上一个点。" };
    case "jump-next":
      if (!jumpMarker(1)) {
        return { ...getState(), error: "没有可跳转的下一个点。" };
      }
      updatePanel();
      return { ...getState(), message: "已跳到下一个点。" };
    case "faster":
      changePlaybackRate(1);
      updatePanel();
      return { ...getState(), message: "已提高倍速。" };
    case "slower":
      changePlaybackRate(-1);
      updatePanel();
      return { ...getState(), message: "已降低倍速。" };
    case "toggle-loop":
      if (!toggleLoop()) {
        return {
          ...getState(),
          error: "请先设置 A/B 点，或至少保留两个打点。"
        };
      }
      return {
        ...getState(),
        message: state.loopEnabled ? "片段循环已开启。" : "片段循环已关闭。"
      };
    case "set-ab-start":
      if (!setABPoint("start")) {
        return { ...getState(), error: "设置 A 点失败。" };
      }
      return { ...getState(), message: "A 点已设置。" };
    case "set-marker-ab-start":
      if (!setABPointFromMarker("start", payload.index)) {
        return { ...getState(), error: "从打点设置 A 点失败。" };
      }
      return { ...getState(), message: "A 点已从打点设置。" };
    case "set-ab-end":
      if (!setABPoint("end")) {
        return { ...getState(), error: "设置 B 点失败。" };
      }
      return { ...getState(), message: "B 点已设置。" };
    case "set-marker-ab-end":
      if (!setABPointFromMarker("end", payload.index)) {
        return { ...getState(), error: "从打点设置 B 点失败。" };
      }
      return { ...getState(), message: "B 点已从打点设置。" };
    case "clear-ab":
      clearABPoints();
      return { ...getState(), message: "A/B 点已清空。" };
    case "seek-ab-start":
      if (!Number.isFinite(state.abStart) || !seekTo(state.abStart)) {
        return { ...getState(), error: "A 点尚未设置。" };
      }
      updatePanel();
      return { ...getState(), message: "已跳到 A 点。" };
    case "save-ab-history":
      if (!(await saveCurrentABSegment())) {
        return { ...getState(), error: "请先设置有效的 A/B 点，再保存历史片段。" };
      }
      return { ...getState(), message: "当前 A/B 片段已保存到历史。" };
    case "seek-history":
      if (!seekHistorySegment(payload.index)) {
        return { ...getState(), error: "历史片段不存在。" };
      }
      updatePanel();
      return { ...getState(), message: "已载入历史片段并跳转到起点。" };
    case "load-history-segment":
      if (!loadHistorySegment(payload)) {
        return { ...getState(), error: "载入历史片段失败。" };
      }
      return { ...getState(), message: "已载入历史片段并跳转到起点。" };
    case "remove-history":
      if (!(await removeHistorySegment(payload.index))) {
        return { ...getState(), error: "删除历史片段失败。" };
      }
      return { ...getState(), message: "已删除历史片段。" };
    case "remove-history-entry": {
      const historyIndex = findHistoryIndexById(payload.entryId);
      if (!(await removeHistorySegment(historyIndex))) {
        return { ...getState(), error: "删除历史片段失败。" };
      }
      return { ...getState(), message: "已删除历史片段。" };
    }
    case "clear-history":
      await clearHistory();
      return { ...getState(), message: "历史片段已清空。" };
    default:
      return {
        ...getState(),
        error: `未知操作：${type}`
      };
  }
}

function bindVideoEvents() {
  const video = getVideoElement();
  if (!video || video.dataset.danceHelperBound === "true") {
    return;
  }

  const update = () => updatePanel();
  const enforceLoop = () => {
    if (!state.loopEnabled) {
      return;
    }

    const range = getLoopRange();
    if (!range) {
      state.loopEnabled = false;
      updatePanel();
      return;
    }

    if (video.currentTime > range.end - 0.05) {
      video.currentTime = range.start;
    }
  };

  video.addEventListener("timeupdate", () => {
    enforceLoop();
    update();
  });
  video.addEventListener("ratechange", update);
  video.addEventListener("play", update);
  video.addEventListener("pause", update);
  video.addEventListener("loadedmetadata", update);
  video.dataset.danceHelperBound = "true";
}

async function initializeForCurrentPage() {
  state.url = location.href;
  state.videoKey = getVideoKey();
  state.loopEnabled = false;
  state.selectedSegmentIndex = -1;
  state.abStart = null;
  state.abEnd = null;
  state.activeHistoryId = "";
  await loadSettings();
  await loadMarkers();
  await loadHistory();

  if (document.body) {
    ensureRoot();
    bindVideoEvents();
    updatePanel();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const response = await performAction(message && message.type, message || {});
    sendResponse(response);
  })().catch((error) => {
    sendResponse({
      ...getState(),
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return true;
});

const observer = new MutationObserver(() => {
  if (location.href !== state.url) {
    initializeForCurrentPage().catch((error) => {
      console.error("Failed to refresh dance helper after URL change", error);
    });
    return;
  }

  if (!state.mounted && document.body) {
    state.mounted = true;
    initializeForCurrentPage().catch((error) => {
      console.error("Failed to initialize dance helper", error);
    });
    return;
  }

  if (document.getElementById(ROOT_ID) && !document.getElementById(ROOT_ID).isConnected) {
    initializeForCurrentPage().catch((error) => {
      console.error("Failed to remount dance helper", error);
    });
  }

  bindVideoEvents();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    state.mounted = true;
    initializeForCurrentPage().catch((error) => {
      console.error("Failed to initialize dance helper", error);
    });
  });
} else {
  state.mounted = true;
  initializeForCurrentPage().catch((error) => {
    console.error("Failed to initialize dance helper", error);
  });
}
