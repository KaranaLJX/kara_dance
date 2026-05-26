chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    danceHelperSettings: {
      panelVisible: true
    }
  });
  console.log("Caradance installed");
});

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;

    if (!tab || !tab.id) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, () => {
      if (chrome.runtime.lastError) {
        console.debug("Message skipped:", chrome.runtime.lastError.message);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "popup-ping") {
    console.log("Popup connected", { tabId: sender.tab ? sender.tab.id : null });
    sendResponse({ ok: true });
  }
});

chrome.commands.onCommand.addListener((command) => {
  const commandToAction = {
    faster: "faster",
    slower: "slower",
    "previous-marker": "jump-previous",
    "next-marker": "jump-next",
    "add-marker": "add-marker",
    "toggle-panel": "toggle-panel"
  };

  const action = commandToAction[command];
  if (!action) {
    return;
  }

  sendToActiveTab({ type: action });
});
