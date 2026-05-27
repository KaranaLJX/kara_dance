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
const globalHistoryListElement = document.getElementById("global-history-list");
const refreshButton = document.getElementById("refresh-button");
const statusElement = document.getElementById("status");
const HISTORY_PREFIX = "dance-helper-history:";
let currentState = null;

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

function normalizeGlobalHistoryEntry(item, videoKey, index) {
  const start = Number(item && item.start);
  const end = Number(item && item.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(end - start) < 0.1) {
    return null;
  }

  return {
    id: (item && item.id) || `${videoKey}-${index}`,
    start: Number(Math.min(start, end).toFixed(1)),
    end: Number(Math.max(start, end).toFixed(1)),
    createdAt: Number(item && item.createdAt) || 0,
    title: (item && item.title) || "未命名视频",
    videoKey,
    url: (item && item.url) || ""
  };
}

function groupHistoryByVideoKey(history) {
  const groupMap = new Map();

  (history || []).forEach((item) => {
    if (!groupMap.has(item.videoKey)) {
      groupMap.set(item.videoKey, {
        videoKey: item.videoKey,
        title: item.title || "未命名视频",
        url: item.url || "",
        latestCreatedAt: item.createdAt || 0,
        items: []
      });
    }

    const group = groupMap.get(item.videoKey);
    group.items.push(item);
    if (item.createdAt > group.latestCreatedAt) {
      group.latestCreatedAt = item.createdAt;
    }
    if (!group.url && item.url) {
      group.url = item.url;
    }
    if ((!group.title || group.title === "未命名视频") && item.title) {
      group.title = item.title;
    }
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => b.createdAt - a.createdAt)
    }))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

async function loadAllVideoHistory() {
  const allStorage = await chrome.storage.local.get(null);
  const entries = [];

  Object.keys(allStorage).forEach((key) => {
    if (!key.startsWith(HISTORY_PREFIX)) {
      return;
    }

    const videoKey = key.slice(HISTORY_PREFIX.length);
    const history = Array.isArray(allStorage[key]) ? allStorage[key] : [];
    history.forEach((item, index) => {
      const normalized = normalizeGlobalHistoryEntry(item, videoKey, index);
      if (normalized) {
        entries.push(normalized);
      }
    });
  });

  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

async function removeGlobalHistoryEntry(videoKey, entryId) {
  const storageKey = `${HISTORY_PREFIX}${videoKey}`;
  const result = await chrome.storage.local.get(storageKey);
  const history = Array.isArray(result[storageKey]) ? result[storageKey] : [];
  const nextHistory = history.filter((item) => item && item.id !== entryId);
  await chrome.storage.local.set({
    [storageKey]: nextHistory
  });
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

    const main = document.createElement("div");
    main.className = "marker-main";

    const time = document.createElement("span");
    time.className = "marker-time";
    time.textContent = formatTime(marker);

    main.appendChild(time);

    if (Number.isFinite(currentState && currentState.abStart) && Math.abs(marker - currentState.abStart) < 0.05) {
      const badge = document.createElement("span");
      badge.className = "marker-badge";
      badge.textContent = "A";
      main.appendChild(badge);
    }

    if (Number.isFinite(currentState && currentState.abEnd) && Math.abs(marker - currentState.abEnd) < 0.05) {
      const badge = document.createElement("span");
      badge.className = "marker-badge";
      badge.textContent = "B";
      main.appendChild(badge);
    }

    const seekButton = document.createElement("button");
    seekButton.type = "button";
    seekButton.textContent = "跳转";
    seekButton.dataset.action = "seek-marker";
    seekButton.dataset.index = String(index);

    const setAButton = document.createElement("button");
    setAButton.type = "button";
    setAButton.textContent = "设A";
    setAButton.className = "secondary";
    setAButton.dataset.action = "set-marker-ab-start";
    setAButton.dataset.index = String(index);

    const setBButton = document.createElement("button");
    setBButton.type = "button";
    setBButton.textContent = "设B";
    setBButton.className = "secondary";
    setBButton.dataset.action = "set-marker-ab-end";
    setBButton.dataset.index = String(index);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.className = "danger";
    removeButton.dataset.action = "remove-marker";
    removeButton.dataset.index = String(index);

    row.append(main, seekButton, setAButton, setBButton, removeButton);
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

function renderGlobalHistory(history, currentVideoKey) {
  globalHistoryListElement.innerHTML = "";

  if (!history || !history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "这里会聚合展示所有视频保存过的片段。";
    globalHistoryListElement.appendChild(empty);
    return;
  }

  const groups = groupHistoryByVideoKey(history);

  groups.forEach((group) => {
    const section = document.createElement("div");
    section.className = "global-history-group";

    const header = document.createElement("div");
    header.className = "global-history-group-header";

    const heading = document.createElement("div");
    heading.className = "history-main";

    const title = document.createElement("span");
    title.className = "history-time";
    title.textContent = group.title || group.videoKey;

    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent =
      group.videoKey === currentVideoKey
        ? `${group.videoKey} · 当前视频 · ${group.items.length} 段`
        : `${group.videoKey} · ${group.items.length} 段`;

    heading.append(title, meta);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "mini secondary";

    if (group.videoKey === currentVideoKey) {
      openButton.textContent = "当前页";
      openButton.disabled = true;
    } else if (group.url) {
      openButton.textContent = "打开视频";
      openButton.dataset.action = "open-global-history";
      openButton.dataset.url = group.url;
    } else {
      openButton.textContent = "无链接";
      openButton.disabled = true;
    }

    header.append(heading, openButton);
    section.appendChild(header);

    group.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";

      const main = document.createElement("div");
      main.className = "history-main";

      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = formatRange(item.start, item.end);

      const itemMeta = document.createElement("span");
      itemMeta.className = "history-meta";
      itemMeta.textContent = item.createdAt
        ? new Date(item.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "历史片段";

      main.append(time, itemMeta);

      const primaryButton = document.createElement("button");
      primaryButton.type = "button";

      if (group.videoKey === currentVideoKey) {
        primaryButton.textContent = "回放";
        primaryButton.dataset.action = "load-global-history";
        primaryButton.dataset.entryId = item.id;
        primaryButton.dataset.videoKey = item.videoKey;
        primaryButton.dataset.start = String(item.start);
        primaryButton.dataset.end = String(item.end);
      } else if (group.url) {
        primaryButton.textContent = "打开";
        primaryButton.dataset.action = "open-global-history";
        primaryButton.dataset.url = group.url;
      } else {
        primaryButton.textContent = "无链接";
        primaryButton.disabled = true;
      }

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "删除";
      removeButton.className = "danger";
      removeButton.dataset.action = "remove-global-history";
      removeButton.dataset.entryId = item.id;
      removeButton.dataset.videoKey = item.videoKey;

      row.append(main, primaryButton, removeButton);
      section.appendChild(row);
    });

    globalHistoryListElement.appendChild(section);
  });
}

function renderState(state, tab, globalHistory) {
  tabInfoElement.textContent = `当前标签页：${(tab && tab.title) || "未命名页面"}`;
  pageStatusElement.textContent = state.isSupportedSite
    ? `${state.siteName || "当前站点"}页面`
    : "非支持站点";
  videoStatusElement.textContent = state.hasVideo ? "已检测到视频" : "未检测到视频";
  timeStatusElement.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  rateStatusElement.textContent = `x${Number(state.playbackRate || 1).toFixed(1)}`;
  markerCountElement.textContent = String((state.markers || []).length);
  abStartStatusElement.textContent = Number.isFinite(state.abStart) ? formatTime(state.abStart) : "未设置";
  abEndStatusElement.textContent = Number.isFinite(state.abEnd) ? formatTime(state.abEnd) : "未设置";
  renderMarkers(state.markers || []);
  renderHistory(state.history || []);
  renderGlobalHistory(globalHistory || [], state.videoKey || "");
}

async function refreshState() {
  const globalHistory = await loadAllVideoHistory();

  try {
    const tab = await getCurrentTab();

    if (!tab || !tab.id) {
      tabInfoElement.textContent = "未找到当前标签页。";
      renderGlobalHistory(globalHistory, "");
      return;
    }

    const state = await sendMessageToCurrentTab({ type: "get-state" });
    currentState = state;
    renderState(state, tab, globalHistory);
    statusElement.textContent = state.hasVideo
      ? "已连接到当前视频。"
      : "当前页面没有可控制的视频。";
  } catch (error) {
    currentState = null;
    renderGlobalHistory(globalHistory, "");
    statusElement.textContent = "请先打开 B站或抖音视频页，再刷新插件。";
    console.error("Failed to refresh state", error);
  }
}

async function openGlobalHistory(url) {
  const tab = await getCurrentTab();
  if (!tab || !tab.id || !url) {
    throw new Error("无法打开历史视频。");
  }

  await chrome.tabs.update(tab.id, { url });
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
  if (action === "load-global-history") {
    await runAction("load-history-segment", {
      entryId: target.dataset.entryId,
      start: Number(target.dataset.start),
      end: Number(target.dataset.end)
    });
    return;
  }

  if (action === "open-global-history") {
    try {
      await openGlobalHistory(target.dataset.url);
      statusElement.textContent = "已打开对应视频。";
    } catch (error) {
      statusElement.textContent = "打开视频失败。";
      console.error("Failed to open history video", error);
    }
    return;
  }

  if (action === "remove-global-history") {
    try {
      const entryId = target.dataset.entryId;
      const videoKey = target.dataset.videoKey;
      if (currentState && videoKey === currentState.videoKey) {
        await runAction("remove-history-entry", { entryId });
      } else {
        await removeGlobalHistoryEntry(videoKey, entryId);
        await refreshState();
        statusElement.textContent = "已删除历史片段。";
      }
    } catch (error) {
      statusElement.textContent = "删除历史片段失败。";
      console.error("Failed to remove global history", error);
    }
    return;
  }

  if (
    action === "remove-marker" ||
    action === "seek-marker" ||
    action === "seek-history" ||
    action === "remove-history" ||
    action === "set-marker-ab-start" ||
    action === "set-marker-ab-end"
  ) {
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
