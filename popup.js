const HISTORY_KEY = "danceHelperHistory";
const VIDEO_STORAGE_PREFIX = "dance-helper-video:";

const tabInfoElement = document.getElementById("tab-info");
const pageStatusElement = document.getElementById("page-status");
const videoStatusElement = document.getElementById("video-status");
const timeStatusElement = document.getElementById("time-status");
const rateStatusElement = document.getElementById("rate-status");
const markerCountElement = document.getElementById("marker-count");
const loopStatusElement = document.getElementById("loop-status");
const markerListElement = document.getElementById("marker-list");
const historyListElement = document.getElementById("history-list");
const historyDetailElement = document.getElementById("history-detail");
const refreshButton = document.getElementById("refresh-button");
const statusElement = document.getElementById("status");
const currentViewElement = document.getElementById("current-view");
const historyViewElement = document.getElementById("history-view");

const popupState = {
  currentState: null,
  currentTab: null,
  activeView: "current",
  historyItems: [],
  selectedHistoryKey: null,
  selectedHistoryData: null
};

function getVideoStorageKey(videoKey) {
  return `${VIDEO_STORAGE_PREFIX}${videoKey}`;
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

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "--";
  }

  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatLoopRange(loopRange) {
  const start = Number.isFinite(loopRange?.start) ? loopRange.start : null;
  const end = Number.isFinite(loopRange?.end) ? loopRange.end : null;

  if (start === null && end === null) {
    return "未设置";
  }

  if (start !== null && end !== null) {
    return `${formatTime(start)} - ${formatTime(end)}${loopRange.enabled ? " (循环中)" : " (已就绪)"}`;
  }

  return start !== null ? `A: ${formatTime(start)}` : `B: ${formatTime(end)}`;
}

function sanitizeFilename(name) {
  return String(name || "dance-helper")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildExportText(videoData) {
  const lines = [
    `标题: ${videoData.title || "未命名视频"}`,
    `链接: ${videoData.url || ""}`,
    `更新时间: ${formatDate(videoData.updatedAt)}`,
    `A-B循环: ${formatLoopRange(videoData.loopRange || {})}`,
    "",
    "打点列表:"
  ];

  if (!videoData.markers?.length) {
    lines.push("- 无打点");
  } else {
    videoData.markers.forEach((marker, index) => {
      lines.push(`- ${index + 1}. ${formatTime(marker.time)}${marker.note ? ` | ${marker.note}` : ""}`);
    });
  }

  return lines.join("\n");
}

function buildExportJson(videoData) {
  return JSON.stringify(videoData, null, 2);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendMessageToCurrentTab(message) {
  const tab = await getCurrentTab();

  if (!tab?.id) {
    throw new Error("未找到当前标签页");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

async function readHistoryItems() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const history = result[HISTORY_KEY] || {};
  return Object.values(history).sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

async function readVideoData(videoKey) {
  if (!videoKey) {
    return null;
  }

  const result = await chrome.storage.local.get(getVideoStorageKey(videoKey));
  return result[getVideoStorageKey(videoKey)] || null;
}

function setActiveView(view) {
  popupState.activeView = view;
  currentViewElement.classList.toggle("active", view === "current");
  historyViewElement.classList.toggle("active", view === "history");

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function clearCurrentState() {
  pageStatusElement.textContent = "未知";
  videoStatusElement.textContent = "未知";
  timeStatusElement.textContent = "--:--";
  rateStatusElement.textContent = "x1.0";
  markerCountElement.textContent = "0";
  loopStatusElement.textContent = "未设置";
  markerListElement.innerHTML = '<p class="empty">当前标签页没有可用视频，或者还未注入内容脚本。</p>';
}

function renderMarkers(markers) {
  markerListElement.innerHTML = "";

  if (!markers?.length) {
    markerListElement.innerHTML = '<p class="empty">还没有打点，先在想拆解的动作处点一下。</p>';
    return;
  }

  markers.forEach((marker) => {
    const item = document.createElement("div");
    item.className = "marker-item";

    const top = document.createElement("div");
    top.className = "marker-top";

    const time = document.createElement("strong");
    time.textContent = formatTime(marker.time);

    const noteLabel = document.createElement("span");
    noteLabel.textContent = marker.note ? "有备注" : "无备注";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "marker-note-input";
    input.placeholder = "给这个动作记个备注，比如：抬手、转身、卡点";
    input.value = marker.note || "";
    input.dataset.noteId = marker.id;

    const actions = document.createElement("div");
    actions.className = "marker-actions";

    const seekButton = document.createElement("button");
    seekButton.type = "button";
    seekButton.textContent = "跳转";
    seekButton.dataset.action = "seek-marker";
    seekButton.dataset.id = marker.id;

    const setAButton = document.createElement("button");
    setAButton.type = "button";
    setAButton.textContent = "设A";
    setAButton.dataset.action = "set-loop-start";
    setAButton.dataset.id = marker.id;

    const setBButton = document.createElement("button");
    setBButton.type = "button";
    setBButton.textContent = "设B";
    setBButton.dataset.action = "set-loop-end";
    setBButton.dataset.id = marker.id;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.className = "danger";
    removeButton.dataset.action = "remove-marker";
    removeButton.dataset.id = marker.id;

    top.append(time, noteLabel);
    actions.append(seekButton, setAButton, setBButton, removeButton);
    item.append(top, input, actions);
    markerListElement.appendChild(item);
  });
}

function renderCurrentState(state, tab) {
  popupState.currentState = state;
  popupState.currentTab = tab;

  tabInfoElement.textContent = `当前标签页：${tab?.title || "未命名页面"}`;
  pageStatusElement.textContent = state.isBilibili ? "B站页面" : "非B站页面";
  videoStatusElement.textContent = state.hasVideo ? "已检测到视频" : "未检测到视频";
  timeStatusElement.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  rateStatusElement.textContent = `x${state.playbackRate.toFixed(1)}`;
  markerCountElement.textContent = String(state.markers.length);
  loopStatusElement.textContent = formatLoopRange(state.loopRange || {});
  renderMarkers(state.markers);
}

function renderHistoryList() {
  historyListElement.innerHTML = "";

  if (!popupState.historyItems.length) {
    historyListElement.innerHTML = '<p class="empty">还没有历史记录。</p>';
    historyDetailElement.innerHTML = '<p class="empty">先在任意视频上记录打点，历史才会出现。</p>';
    return;
  }

  popupState.historyItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    if (popupState.selectedHistoryKey === item.videoKey) {
      row.classList.add("active");
    }

    const top = document.createElement("div");
    top.className = "history-item-top";

    const title = document.createElement("strong");
    title.textContent = item.title || item.videoKey;

    const count = document.createElement("span");
    count.textContent = `${item.markerCount || 0} 个点`;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `更新于 ${formatDate(item.updatedAt)}${item.hasLoop ? "，含 A-B 循环" : ""}`;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = popupState.selectedHistoryKey === item.videoKey ? "已选中" : "查看详情";
    selectButton.dataset.historyKey = item.videoKey;

    top.append(title, count);
    actions.appendChild(selectButton);
    row.append(top, meta, actions);
    historyListElement.appendChild(row);
  });
}

function renderHistoryDetail() {
  const videoData = popupState.selectedHistoryData;
  historyDetailElement.innerHTML = "";

  if (!videoData) {
    historyDetailElement.innerHTML = '<p class="empty">先从上面选一个视频。</p>';
    return;
  }

  const header = document.createElement("div");
  header.className = "detail-top";

  const title = document.createElement("strong");
  title.textContent = videoData.title || videoData.videoKey;

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "打开视频";
  openButton.dataset.historyOpen = videoData.url || "";

  const meta = document.createElement("div");
  meta.className = "detail-meta";
  meta.textContent = `更新时间 ${formatDate(videoData.updatedAt)} | A-B ${formatLoopRange(videoData.loopRange || {})}`;

  historyDetailElement.append(header, meta);
  header.append(title, openButton);

  if (!videoData.markers?.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "这个视频当前没有打点。";
    historyDetailElement.appendChild(empty);
    return;
  }

  videoData.markers.forEach((marker) => {
    const item = document.createElement("div");
    item.className = "detail-marker";

    const top = document.createElement("div");
    top.className = "detail-top";

    const time = document.createElement("strong");
    time.textContent = formatTime(marker.time);

    const note = document.createElement("div");
    note.className = "detail-note";
    note.textContent = marker.note || "无备注";

    top.appendChild(time);
    item.append(top, note);
    historyDetailElement.appendChild(item);
  });
}

async function refreshHistory() {
  popupState.historyItems = await readHistoryItems();

  if (!popupState.historyItems.length) {
    popupState.selectedHistoryKey = null;
    popupState.selectedHistoryData = null;
    renderHistoryList();
    return;
  }

  const hasSelected = popupState.historyItems.some((item) => item.videoKey === popupState.selectedHistoryKey);
  if (!hasSelected) {
    popupState.selectedHistoryKey = popupState.historyItems[0].videoKey;
  }

  popupState.selectedHistoryData = await readVideoData(popupState.selectedHistoryKey);
  renderHistoryList();
  renderHistoryDetail();
}

async function refreshState() {
  try {
    const tab = await getCurrentTab();
    popupState.currentTab = tab;

    if (!tab?.id) {
      tabInfoElement.textContent = "未找到当前标签页。";
      clearCurrentState();
      return;
    }

    const state = await sendMessageToCurrentTab({ type: "get-state" });
    renderCurrentState(state, tab);
    statusElement.textContent = state.hasVideo
      ? "已连接到当前视频。"
      : "当前页面没有可控制的视频。";
  } catch (error) {
    clearCurrentState();
    statusElement.textContent = "当前页不可直接控制，但历史记录仍可查看。";
    console.error("Failed to refresh state", error);
  }
}

async function runAction(action, extra = {}) {
  try {
    const response = await sendMessageToCurrentTab({ type: action, ...extra });

    if (response?.error) {
      statusElement.textContent = response.error;
      return;
    }

    await refreshState();
    await refreshHistory();
    statusElement.textContent = response?.message || "操作已执行。";
  } catch (error) {
    statusElement.textContent = "操作失败，请确认当前页已注入插件。";
    console.error(`Action failed: ${action}`, error);
  }
}

async function handleExport(kind, source) {
  const videoData = source === "history" ? popupState.selectedHistoryData : popupState.currentState;
  if (!videoData) {
    statusElement.textContent = "没有可导出的数据。";
    return;
  }

  const filenameBase = sanitizeFilename(videoData.title || videoData.videoKey || "dance-helper");
  if (kind === "txt") {
    triggerDownload(`${filenameBase}.txt`, buildExportText(videoData), "text/plain;charset=utf-8");
    statusElement.textContent = "TXT 已导出。";
    return;
  }

  triggerDownload(
    `${filenameBase}.json`,
    buildExportJson(videoData),
    "application/json;charset=utf-8"
  );
  statusElement.textContent = "JSON 已导出。";
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const tabButton = target.closest("[data-view]");
  if (tabButton instanceof HTMLElement && tabButton.dataset.view) {
    setActiveView(tabButton.dataset.view);
    return;
  }

  const historySelectButton = target.closest("[data-history-key]");
  if (historySelectButton instanceof HTMLElement && historySelectButton.dataset.historyKey) {
    popupState.selectedHistoryKey = historySelectButton.dataset.historyKey;
    popupState.selectedHistoryData = await readVideoData(popupState.selectedHistoryKey);
    renderHistoryList();
    renderHistoryDetail();
    return;
  }

  const exportButton = target.closest("[data-export-kind]");
  if (exportButton instanceof HTMLElement) {
    await handleExport(exportButton.dataset.exportKind, exportButton.dataset.exportSource);
    return;
  }

  const openButton = target.closest("[data-history-open]");
  if (openButton instanceof HTMLElement && openButton.dataset.historyOpen) {
    chrome.tabs.create({ url: openButton.dataset.historyOpen });
    return;
  }

  const actionButton = target.closest("[data-action]");
  if (actionButton instanceof HTMLElement && actionButton.dataset.action) {
    await runAction(actionButton.dataset.action, { id: actionButton.dataset.id });
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.noteId) {
    return;
  }

  await runAction("update-marker-note", {
    id: target.dataset.noteId,
    note: target.value
  });
});

refreshButton.addEventListener("click", async () => {
  await refreshState();
  await refreshHistory();
});

chrome.runtime
  .sendMessage({ type: "popup-ping" })
  .catch(() => undefined)
  .finally(async () => {
    await refreshState();
    await refreshHistory();
  });
