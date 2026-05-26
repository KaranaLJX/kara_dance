const ROOT_ID = "dance-helper-root";
const STYLE_ID = "dance-helper-style";
const STORAGE_PREFIX = "dance-helper-markers:";
const SETTINGS_KEY = "danceHelperSettings";
const SPEED_STEPS = [0.3, 0.5, 0.7, 0.9, 1, 1.25, 1.5, 2];

const state = {
  url: location.href,
  markers: [],
  loopEnabled: false,
  selectedSegmentIndex: -1,
  panelVisible: true,
  videoKey: "",
  mounted: false
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
  return title?.textContent?.trim() || document.title || "Bilibili 视频";
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

function normalizeMarkers(markers) {
  return [...new Set(markers.map((value) => Number(value.toFixed(1))))]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
}

async function saveMarkers() {
  if (!state.videoKey) {
    return;
  }

  await chrome.storage.local.set({
    [`${STORAGE_PREFIX}${state.videoKey}`]: state.markers
  });
}

async function saveSettings() {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      panelVisible: state.panelVisible
    }
  });
}

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  state.panelVisible = result?.[SETTINGS_KEY]?.panelVisible ?? true;
}

async function loadMarkers() {
  state.videoKey = getVideoKey();
  const storageKey = `${STORAGE_PREFIX}${state.videoKey}`;
  const result = await chrome.storage.local.get(storageKey);
  state.markers = normalizeMarkers(result[storageKey] || []);
  state.selectedSegmentIndex = clampSegmentIndex(state.selectedSegmentIndex);
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

function getLoopSegment() {
  const segmentIndex =
    state.selectedSegmentIndex >= 0 ? state.selectedSegmentIndex : getCurrentSegmentIndex();

  if (segmentIndex < 0 || state.markers.length < 2) {
    return null;
  }

  return {
    index: segmentIndex,
    start: state.markers[segmentIndex],
    end: state.markers[segmentIndex + 1]
  };
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
  video.playbackRate = SPEED_STEPS[index];
  return true;
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
  state.loopEnabled = false;
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

  seekTo(target);
  return true;
}

function toggleLoop() {
  const segment = getLoopSegment();
  if (!segment) {
    return false;
  }

  state.selectedSegmentIndex = segment.index;
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
      width: 300px;
      font-family: Arial, sans-serif;
      color: #101828;
    }
    #${ROOT_ID}.hidden {
      display: none;
    }
    #${ROOT_ID} .panel {
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }
    #${ROOT_ID} .header {
      padding: 14px 16px 8px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
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
      grid-template-columns: 1fr 1fr;
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
    #${ROOT_ID} .marker-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 220px;
      overflow-y: auto;
    }
    #${ROOT_ID} .marker-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12px;
    }
    #${ROOT_ID} .marker-item.active {
      outline: 2px solid #2563eb;
    }
    #${ROOT_ID} .marker-item button {
      padding: 6px 8px;
      font-size: 12px;
    }
    #${ROOT_ID} .empty {
      padding: 12px 8px;
      font-size: 12px;
      color: #667085;
      text-align: center;
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
    <div class="panel">
      <div class="header">
        <div class="title">B站扒舞助手</div>
        <div class="subtitle" data-role="subtitle">等待视频加载...</div>
      </div>
      <div class="body">
        <div class="stats">
          <div class="stat">当前时间<strong data-role="current-time">--:--</strong></div>
          <div class="stat">播放速度<strong data-role="rate">x1.0</strong></div>
          <div class="stat">打点数<strong data-role="marker-count">0</strong></div>
          <div class="stat">循环片段<strong data-role="loop">关闭</strong></div>
        </div>
        <div class="buttons">
          <button data-action="toggle-play">播放 / 暂停</button>
          <button data-action="add-marker">记录当前点</button>
          <button data-action="jump-previous">上一个点</button>
          <button data-action="jump-next">下一个点</button>
          <button data-action="slower">减速</button>
          <button data-action="faster">加速</button>
          <button class="secondary" data-action="toggle-loop">片段循环</button>
          <button class="danger" data-action="clear-markers">清空打点</button>
        </div>
        <div class="marker-list" data-role="marker-list"></div>
      </div>
    </div>
  `;

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const { action, index } = target.dataset;
    if (!action) {
      return;
    }

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

  const video = getVideoElement();
  const subtitle = root.querySelector('[data-role="subtitle"]');
  const currentTime = root.querySelector('[data-role="current-time"]');
  const rate = root.querySelector('[data-role="rate"]');
  const markerCount = root.querySelector('[data-role="marker-count"]');
  const loop = root.querySelector('[data-role="loop"]');
  const markerList = root.querySelector('[data-role="marker-list"]');

  subtitle.textContent = video ? getVideoTitle() : "当前页面未检测到视频";
  currentTime.textContent = video ? formatTime(video.currentTime) : "--:--";
  rate.textContent = video ? `x${video.playbackRate.toFixed(1)}` : "x1.0";
  markerCount.textContent = String(state.markers.length);

  const segment = getLoopSegment();
  loop.textContent =
    state.loopEnabled && segment
      ? `${formatTime(segment.start)} - ${formatTime(segment.end)}`
      : "关闭";

  markerList.innerHTML = "";
  if (!state.markers.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "先暂停在动作关键帧，再点击“记录当前点”。";
    markerList.appendChild(empty);
    return;
  }

  state.markers.forEach((marker, index) => {
    const item = document.createElement("div");
    item.className = "marker-item";
    if (
      state.selectedSegmentIndex >= 0 &&
      (index === state.selectedSegmentIndex || index === state.selectedSegmentIndex + 1)
    ) {
      item.classList.add("active");
    }

    const time = document.createElement("strong");
    time.textContent = formatTime(marker);

    const seek = document.createElement("button");
    seek.textContent = "跳转";
    seek.dataset.action = "seek-marker";
    seek.dataset.index = String(index);

    const remove = document.createElement("button");
    remove.textContent = "删除";
    remove.className = "danger";
    remove.dataset.action = "remove-marker";
    remove.dataset.index = String(index);

    item.append(time, seek, remove);
    markerList.appendChild(item);
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
    currentTime: video?.currentTime ?? 0,
    duration: video?.duration ?? 0,
    playbackRate: video?.playbackRate ?? 1,
    paused: video?.paused ?? true,
    markers: state.markers,
    loopEnabled: state.loopEnabled,
    currentSegmentIndex: getCurrentSegmentIndex()
  };
}

async function performAction(type, payload = {}) {
  const video = getVideoElement();
  if (!video && type !== "get-state" && type !== "toggle-panel") {
    return {
      ...getState(),
      error: "当前页面没有检测到视频。"
    };
  }

  switch (type) {
    case "get-state":
      return getState();
    case "toggle-panel":
      state.panelVisible = !state.panelVisible;
      await saveSettings();
      updatePanel();
      return { ...getState(), message: state.panelVisible ? "面板已显示。" : "面板已隐藏。" };
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
          error: "至少需要两个打点，才能对片段进行循环。"
        };
      }
      return {
        ...getState(),
        message: state.loopEnabled ? "片段循环已开启。" : "片段循环已关闭。"
      };
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

    const segment = getLoopSegment();
    if (!segment) {
      state.loopEnabled = false;
      updatePanel();
      return;
    }

    if (video.currentTime > segment.end - 0.05) {
      video.currentTime = segment.start;
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
  await loadSettings();
  await loadMarkers();

  if (document.body) {
    ensureRoot();
    bindVideoEvents();
    updatePanel();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const response = await performAction(message?.type, message);
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
