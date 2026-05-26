const ROOT_ID = "dance-helper-root";
const STYLE_ID = "dance-helper-style";
const VIDEO_STORAGE_PREFIX = "dance-helper-video:";
const HISTORY_KEY = "danceHelperHistory";
const SETTINGS_KEY = "danceHelperSettings";
const SPEED_STEPS = [0.3, 0.5, 0.7, 0.9, 1, 1.25, 1.5, 2];
const LOOP_EPSILON = 0.05;

const state = {
  url: location.href,
  mounted: false,
  panelVisible: true,
  videoKey: "",
  videoData: createEmptyVideoData()
};

function roundTime(value) {
  return Number(Number(value).toFixed(1));
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function createEmptyVideoData(videoKey = "", title = "", url = location.href) {
  return {
    videoKey,
    title,
    url,
    updatedAt: 0,
    markers: [],
    loopRange: {
      enabled: false,
      start: null,
      end: null
    }
  };
}

function createMarker(rawMarker, index = 0) {
  if (typeof rawMarker === "number") {
    const time = roundTime(rawMarker);
    return {
      id: `marker_${Math.round(time * 10)}_${index}`,
      time,
      note: ""
    };
  }

  const time = roundTime(rawMarker?.time ?? rawMarker?.value ?? 0);
  const note = typeof rawMarker?.note === "string" ? rawMarker.note.trim() : "";

  return {
    id: typeof rawMarker?.id === "string" && rawMarker.id ? rawMarker.id : `marker_${Math.round(time * 10)}_${index}`,
    time,
    note
  };
}

function normalizeMarkers(markers) {
  const normalized = (Array.isArray(markers) ? markers : [])
    .map((marker, index) => createMarker(marker, index))
    .filter((marker) => isFiniteNumber(marker.time) && marker.time >= 0)
    .sort((left, right) => left.time - right.time);

  const deduped = [];
  for (const marker of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.time - marker.time) < 0.05) {
      if (!previous.note && marker.note) {
        previous.note = marker.note;
      }
      continue;
    }
    deduped.push(marker);
  }

  return deduped;
}

function normalizeLoopRange(rawLoopRange) {
  const start = isFiniteNumber(rawLoopRange?.start) ? roundTime(rawLoopRange.start) : null;
  const end = isFiniteNumber(rawLoopRange?.end) ? roundTime(rawLoopRange.end) : null;

  if (start !== null && end !== null) {
    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    return {
      enabled: Boolean(rawLoopRange?.enabled) && rangeEnd - rangeStart > 0,
      start: rangeStart,
      end: rangeEnd
    };
  }

  return {
    enabled: false,
    start,
    end
  };
}

function normalizeVideoData(rawVideoData, videoKey, title, url) {
  if (Array.isArray(rawVideoData)) {
    return {
      ...createEmptyVideoData(videoKey, title, url),
      markers: normalizeMarkers(rawVideoData)
    };
  }

  const normalized = createEmptyVideoData(videoKey, title, url);
  if (!rawVideoData || typeof rawVideoData !== "object") {
    return normalized;
  }

  normalized.title = typeof rawVideoData.title === "string" && rawVideoData.title ? rawVideoData.title : title;
  normalized.url = typeof rawVideoData.url === "string" && rawVideoData.url ? rawVideoData.url : url;
  normalized.updatedAt = isFiniteNumber(rawVideoData.updatedAt) ? rawVideoData.updatedAt : 0;
  normalized.markers = normalizeMarkers(rawVideoData.markers);
  normalized.loopRange = normalizeLoopRange(rawVideoData.loopRange);
  return normalized;
}

function getVideoStorageKey(videoKey) {
  return `${VIDEO_STORAGE_PREFIX}${videoKey}`;
}

function hasPersistentData(videoData) {
  return (
    videoData.markers.length > 0 ||
    isFiniteNumber(videoData.loopRange.start) ||
    isFiniteNumber(videoData.loopRange.end)
  );
}

function isBilibiliPage() {
  return location.host.includes("bilibili.com");
}

function getVideoElement() {
  const videos = Array.from(document.querySelectorAll("video"));
  return videos.find((video) => Number.isFinite(video.duration) || video.readyState > 0) || videos[0] || null;
}

function getVideoTitle() {
  const titleElement = document.querySelector("h1");
  return titleElement?.textContent?.trim() || document.title || "Bilibili 视频";
}

function getVideoKey() {
  const matchedId = location.pathname.match(/(BV[\w]+|av\d+|ep\d+|ss\d+)/i);
  return matchedId ? matchedId[1].toUpperCase() : `${location.host}${location.pathname}`;
}

function formatTime(seconds) {
  if (!isFiniteNumber(seconds)) {
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

function getMarkers() {
  return state.videoData.markers;
}

function getMarkerById(id) {
  return getMarkers().find((marker) => marker.id === id) || null;
}

function getLoopRange() {
  return state.videoData.loopRange;
}

function getActiveLoopRange() {
  const loopRange = normalizeLoopRange(getLoopRange());
  if (!loopRange.enabled || loopRange.start === null || loopRange.end === null) {
    return null;
  }
  return loopRange;
}

function getLoopStateText() {
  const loopRange = getLoopRange();
  if (loopRange.start === null && loopRange.end === null) {
    return "未设置";
  }

  if (loopRange.start !== null && loopRange.end !== null) {
    const label = `${formatTime(loopRange.start)} - ${formatTime(loopRange.end)}`;
    return loopRange.enabled ? `${label} (循环中)` : `${label} (已就绪)`;
  }

  return loopRange.start !== null ? `A: ${formatTime(loopRange.start)}` : `B: ${formatTime(loopRange.end)}`;
}

function getCurrentSegmentIndex() {
  const video = getVideoElement();
  const markers = getMarkers();
  if (!video || markers.length < 2) {
    return -1;
  }

  for (let index = 0; index < markers.length - 1; index += 1) {
    if (video.currentTime >= markers[index].time && video.currentTime < markers[index + 1].time) {
      return index;
    }
  }

  if (video.currentTime < markers[0].time) {
    return 0;
  }

  return markers.length - 2;
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

async function loadCurrentVideoData() {
  state.videoKey = getVideoKey();
  const storageKey = getVideoStorageKey(state.videoKey);
  const title = getVideoTitle();
  const result = await chrome.storage.local.get(storageKey);
  state.videoData = normalizeVideoData(result[storageKey], state.videoKey, title, location.href);
}

async function saveCurrentVideoData() {
  state.videoData.videoKey = state.videoKey;
  state.videoData.title = getVideoTitle();
  state.videoData.url = location.href;
  state.videoData.updatedAt = Date.now();
  state.videoData.markers = normalizeMarkers(state.videoData.markers);
  state.videoData.loopRange = normalizeLoopRange(state.videoData.loopRange);

  const storageKey = getVideoStorageKey(state.videoKey);
  const historyResult = await chrome.storage.local.get(HISTORY_KEY);
  const history = historyResult[HISTORY_KEY] || {};

  if (hasPersistentData(state.videoData)) {
    await chrome.storage.local.set({
      [storageKey]: state.videoData,
      [HISTORY_KEY]: {
        ...history,
        [state.videoKey]: {
          videoKey: state.videoKey,
          title: state.videoData.title,
          url: state.videoData.url,
          updatedAt: state.videoData.updatedAt,
          markerCount: state.videoData.markers.length,
          hasLoop:
            isFiniteNumber(state.videoData.loopRange.start) &&
            isFiniteNumber(state.videoData.loopRange.end)
        }
      }
    });
    return;
  }

  delete history[state.videoKey];
  await chrome.storage.local.remove(storageKey);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

function seekTo(seconds) {
  const video = getVideoElement();
  if (!video || !isFiniteNumber(seconds)) {
    return false;
  }

  video.currentTime = Math.max(0, seconds);
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

  index = Math.max(0, Math.min(index + direction, SPEED_STEPS.length - 1));
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

  state.videoData.markers = normalizeMarkers([
    ...getMarkers(),
    {
      id: `marker_${Date.now()}`,
      time: roundTime(video.currentTime),
      note: ""
    }
  ]);
  await saveCurrentVideoData();
  updatePanel();
  return true;
}

async function updateMarkerNote(id, note) {
  const marker = getMarkerById(id);
  if (!marker) {
    return false;
  }

  marker.note = typeof note === "string" ? note.trim() : "";
  await saveCurrentVideoData();
  updatePanel();
  return true;
}

async function removeMarker(id) {
  const nextMarkers = getMarkers().filter((marker) => marker.id !== id);
  if (nextMarkers.length === getMarkers().length) {
    return false;
  }

  state.videoData.markers = nextMarkers;
  await saveCurrentVideoData();
  updatePanel();
  return true;
}

async function clearMarkers() {
  state.videoData.markers = [];
  state.videoData.loopRange.enabled = false;
  await saveCurrentVideoData();
  updatePanel();
  return true;
}

function jumpMarker(direction) {
  const video = getVideoElement();
  const markers = getMarkers();
  if (!video || !markers.length) {
    return false;
  }

  let targetTime = null;
  if (direction < 0) {
    for (let index = markers.length - 1; index >= 0; index -= 1) {
      if (markers[index].time < video.currentTime - 0.2) {
        targetTime = markers[index].time;
        break;
      }
    }
    if (targetTime === null) {
      targetTime = markers[0].time;
    }
  } else {
    for (let index = 0; index < markers.length; index += 1) {
      if (markers[index].time > video.currentTime + 0.2) {
        targetTime = markers[index].time;
        break;
      }
    }
    if (targetTime === null) {
      targetTime = markers[markers.length - 1].time;
    }
  }

  return seekTo(targetTime);
}

async function setLoopPoint(point, markerId) {
  let targetTime = null;
  if (typeof markerId === "string") {
    const marker = getMarkerById(markerId);
    if (marker) {
      targetTime = marker.time;
    }
  }

  if (targetTime === null) {
    const video = getVideoElement();
    if (!video) {
      return false;
    }
    targetTime = roundTime(video.currentTime);
  }

  if (point === "start") {
    state.videoData.loopRange.start = targetTime;
  }
  if (point === "end") {
    state.videoData.loopRange.end = targetTime;
  }

  state.videoData.loopRange = normalizeLoopRange(state.videoData.loopRange);
  if (state.videoData.loopRange.start === null || state.videoData.loopRange.end === null) {
    state.videoData.loopRange.enabled = false;
  }

  await saveCurrentVideoData();
  updatePanel();
  return true;
}

async function clearLoopRange() {
  state.videoData.loopRange = {
    enabled: false,
    start: null,
    end: null
  };
  await saveCurrentVideoData();
  updatePanel();
  return true;
}

async function toggleLoop() {
  const normalizedLoopRange = normalizeLoopRange(state.videoData.loopRange);
  if (normalizedLoopRange.start === null || normalizedLoopRange.end === null) {
    return false;
  }

  normalizedLoopRange.enabled = !normalizedLoopRange.enabled;
  state.videoData.loopRange = normalizedLoopRange;
  await saveCurrentVideoData();
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
      width: 320px;
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
      font-size: 13px;
      line-height: 1.3;
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
      max-height: 260px;
      overflow-y: auto;
    }
    #${ROOT_ID} .marker-item {
      padding: 10px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12px;
    }
    #${ROOT_ID} .marker-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    #${ROOT_ID} .marker-note {
      color: #475467;
      line-height: 1.4;
      word-break: break-word;
    }
    #${ROOT_ID} .marker-actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-top: 8px;
    }
    #${ROOT_ID} .marker-actions button {
      padding: 6px 0;
      font-size: 11px;
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
          <div class="stat">A-B循环<strong data-role="loop-state">未设置</strong></div>
        </div>
        <div class="buttons">
          <button data-action="toggle-play">播放 / 暂停</button>
          <button data-action="add-marker">记录当前点</button>
          <button data-action="jump-previous">上一个点</button>
          <button data-action="jump-next">下一个点</button>
          <button data-action="slower">减速</button>
          <button data-action="faster">加速</button>
          <button class="secondary" data-action="set-loop-start">设为A点</button>
          <button class="secondary" data-action="set-loop-end">设为B点</button>
          <button class="secondary" data-action="toggle-loop">开关循环</button>
          <button class="danger" data-action="clear-loop">清空A-B</button>
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

    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const { action, id } = button.dataset;
    if (!action) {
      return;
    }

    await performAction(action, { id });
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
  const loopState = root.querySelector('[data-role="loop-state"]');
  const markerList = root.querySelector('[data-role="marker-list"]');

  subtitle.textContent = video ? state.videoData.title || getVideoTitle() : "当前页面未检测到视频";
  currentTime.textContent = video ? formatTime(video.currentTime) : "--:--";
  rate.textContent = video ? `x${video.playbackRate.toFixed(1)}` : "x1.0";
  markerCount.textContent = String(getMarkers().length);
  loopState.textContent = getLoopStateText();

  markerList.innerHTML = "";
  if (!getMarkers().length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "先暂停在关键动作，再点“记录当前点”，之后可补备注并设 A/B。";
    markerList.appendChild(empty);
    return;
  }

  const activeLoopRange = getActiveLoopRange();
  for (const marker of getMarkers()) {
    const item = document.createElement("div");
    item.className = "marker-item";

    const top = document.createElement("div");
    top.className = "marker-top";

    const time = document.createElement("strong");
    time.textContent = formatTime(marker.time);

    const loopTag = document.createElement("span");
    if (activeLoopRange) {
      if (Math.abs(activeLoopRange.start - marker.time) < 0.05) {
        loopTag.textContent = "A";
      }
      if (Math.abs(activeLoopRange.end - marker.time) < 0.05) {
        loopTag.textContent = loopTag.textContent ? `${loopTag.textContent}/B` : "B";
      }
    }

    top.append(time, loopTag);

    const note = document.createElement("div");
    note.className = "marker-note";
    note.textContent = marker.note || "无备注";

    const actions = document.createElement("div");
    actions.className = "marker-actions";

    const seekButton = document.createElement("button");
    seekButton.textContent = "跳转";
    seekButton.dataset.action = "seek-marker";
    seekButton.dataset.id = marker.id;

    const setAButton = document.createElement("button");
    setAButton.textContent = "设A";
    setAButton.dataset.action = "set-loop-start";
    setAButton.dataset.id = marker.id;

    const setBButton = document.createElement("button");
    setBButton.textContent = "设B";
    setBButton.dataset.action = "set-loop-end";
    setBButton.dataset.id = marker.id;

    const removeButton = document.createElement("button");
    removeButton.textContent = "删除";
    removeButton.className = "danger";
    removeButton.dataset.action = "remove-marker";
    removeButton.dataset.id = marker.id;

    actions.append(seekButton, setAButton, setBButton, removeButton);
    item.append(top, note, actions);
    markerList.appendChild(item);
  }
}

function getState() {
  const video = getVideoElement();
  return {
    ok: true,
    isBilibili: isBilibiliPage(),
    hasVideo: Boolean(video),
    title: state.videoData.title || getVideoTitle(),
    url: location.href,
    videoKey: state.videoKey,
    currentTime: video?.currentTime ?? 0,
    duration: video?.duration ?? 0,
    playbackRate: video?.playbackRate ?? 1,
    paused: video?.paused ?? true,
    markers: getMarkers(),
    loopRange: getLoopRange(),
    currentSegmentIndex: getCurrentSegmentIndex()
  };
}

async function performAction(type, payload = {}) {
  const video = getVideoElement();
  if (!video && !["get-state", "toggle-panel"].includes(type)) {
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
      return {
        ...getState(),
        message: state.panelVisible ? "面板已显示。" : "面板已隐藏。"
      };
    case "toggle-play":
      togglePlay();
      updatePanel();
      return {
        ...getState(),
        message: getVideoElement()?.paused ? "已暂停。" : "已开始播放。"
      };
    case "add-marker":
      await addMarker();
      return { ...getState(), message: "已记录当前时间点。" };
    case "update-marker-note":
      if (!(await updateMarkerNote(payload.id, payload.note))) {
        return { ...getState(), error: "备注保存失败，打点不存在。" };
      }
      return { ...getState(), message: "备注已保存。" };
    case "remove-marker":
      if (!(await removeMarker(payload.id))) {
        return { ...getState(), error: "删除失败，打点不存在。" };
      }
      return { ...getState(), message: "已删除打点。" };
    case "seek-marker": {
      const marker = getMarkerById(payload.id);
      if (!marker || !seekTo(marker.time)) {
        return { ...getState(), error: "跳转失败。" };
      }
      updatePanel();
      return { ...getState(), message: "已跳转到打点。" };
    }
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
    case "set-loop-start":
      if (!(await setLoopPoint("start", payload.id))) {
        return { ...getState(), error: "A 点设置失败。" };
      }
      return { ...getState(), message: "A 点已设置。" };
    case "set-loop-end":
      if (!(await setLoopPoint("end", payload.id))) {
        return { ...getState(), error: "B 点设置失败。" };
      }
      return { ...getState(), message: "B 点已设置。" };
    case "toggle-loop":
      if (!(await toggleLoop())) {
        return { ...getState(), error: "请先把 A 点和 B 点都设置好。" };
      }
      return {
        ...getState(),
        message: getLoopRange().enabled ? "A-B 循环已开启。" : "A-B 循环已关闭。"
      };
    case "clear-loop":
      await clearLoopRange();
      return { ...getState(), message: "A-B 循环范围已清空。" };
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
    const activeLoopRange = getActiveLoopRange();
    if (!activeLoopRange) {
      return;
    }

    if (video.currentTime >= activeLoopRange.end - LOOP_EPSILON) {
      video.currentTime = activeLoopRange.start;
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
  await loadSettings();
  await loadCurrentVideoData();

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

  if (!document.getElementById(ROOT_ID) && document.body) {
    ensureRoot();
    updatePanel();
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
