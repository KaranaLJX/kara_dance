const tabInfoElement = document.getElementById("tab-info");
const pageStatusElement = document.getElementById("page-status");
const videoStatusElement = document.getElementById("video-status");
const timeStatusElement = document.getElementById("time-status");
const rateStatusElement = document.getElementById("rate-status");
const markerCountElement = document.getElementById("marker-count");
const abStartStatusElement = document.getElementById("ab-start-status");
const abEndStatusElement = document.getElementById("ab-end-status");
const markerListElement = document.getElementById("marker-list");
const historyListElement = document.getElementById("history-list");
const refreshButton = document.getElementById("refresh-button");
const statusElement = document.getElementById("status");

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

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendMessageToCurrentTab(message) {
  const tab = await getCurrentTab();

  if (!tab || !tab.id) {
    throw new Error("未找到当前标签页");
  }

  return chrome.tabs.sendMessage(tab.id, message);
}

function renderMarkers(markers) {
  markerListElement.innerHTML = "";

  if (!markers || !markers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有打点，先在想拆解的动作处点一下。";
    markerListElement.appendChild(empty);
    return;
  }

  markers.forEach((marker, index) => {
    const row = document.createElement("div");
    row.className = "marker-item";

    const time = document.createElement("span");
    time.className = "marker-time";
    time.textContent = formatTime(marker);

    const seekButton = document.createElement("button");
    seekButton.type = "button";
    seekButton.textContent = "跳转";
    seekButton.dataset.action = "seek-marker";
    seekButton.dataset.index = String(index);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.className = "danger";
    removeButton.dataset.action = "remove-marker";
    removeButton.dataset.index = String(index);

    row.append(time, seekButton, removeButton);
    markerListElement.appendChild(row);
  });
}

function renderHistory(history) {
  historyListElement.innerHTML = "";

  if (!history || !history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "保存过的 A/B 片段会出现在这里。";
    historyListElement.appendChild(empty);
    return;
  }

  history.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";

    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = formatRange(item.start, item.end);

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = item.title || "当前视频";

    main.append(time, meta);

    const seekButton = document.createElement("button");
    seekButton.type = "button";
    seekButton.textContent = "回放";
    seekButton.dataset.action = "seek-history";
    seekButton.dataset.index = String(index);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.className = "danger";
    removeButton.dataset.action = "remove-history";
    removeButton.dataset.index = String(index);

    row.append(main, seekButton, removeButton);
    historyListElement.appendChild(row);
  });
}

function renderState(state, tab) {
  tabInfoElement.textContent = `当前标签页：${(tab && tab.title) || "未命名页面"}`;
  pageStatusElement.textContent = state.isBilibili ? "B站页面" : "非B站页面";
  videoStatusElement.textContent = state.hasVideo ? "已检测到视频" : "未检测到视频";
  timeStatusElement.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  rateStatusElement.textContent = `x${Number(state.playbackRate || 1).toFixed(1)}`;
  markerCountElement.textContent = String((state.markers || []).length);
  abStartStatusElement.textContent = Number.isFinite(state.abStart) ? formatTime(state.abStart) : "未设置";
  abEndStatusElement.textContent = Number.isFinite(state.abEnd) ? formatTime(state.abEnd) : "未设置";
  renderMarkers(state.markers || []);
  renderHistory(state.history || []);
}

async function refreshState() {
  try {
    const tab = await getCurrentTab();

    if (!tab || !tab.id) {
      tabInfoElement.textContent = "未找到当前标签页。";
      return;
    }

    const state = await sendMessageToCurrentTab({ type: "get-state" });
    renderState(state, tab);
    statusElement.textContent = state.hasVideo
      ? "已连接到当前视频。"
      : "当前页面没有可控制的视频。";
  } catch (error) {
    statusElement.textContent = "请先打开 B 站视频页，再刷新插件。";
    console.error("Failed to refresh state", error);
  }
}

async function runAction(action, extra) {
  try {
    const response = await sendMessageToCurrentTab({
      type: action,
      ...(extra || {})
    });

    if (response && response.error) {
      statusElement.textContent = response.error;
      return;
    }

    await refreshState();
    statusElement.textContent = (response && response.message) || "操作已执行。";
  } catch (error) {
    statusElement.textContent = "操作失败，请确认当前页已注入插件。";
    console.error(`Action failed: ${action}`, error);
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  if (!action) {
    return;
  }

  const index = target.dataset.index;
  if (action === "remove-marker" || action === "seek-marker" || action === "seek-history" || action === "remove-history") {
    await runAction(action, { index: Number(index) });
    return;
  }

  await runAction(action);
});

refreshButton.addEventListener("click", refreshState);

chrome.runtime
  .sendMessage({ type: "popup-ping" })
  .catch(() => undefined)
  .finally(refreshState);
