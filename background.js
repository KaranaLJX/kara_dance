chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    helloClickCount: 0
  });
  console.log("Hello World extension installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "hello-from-popup") {
    console.log("Popup says hello", { tabId: sender.tab?.id ?? null });
    sendResponse({ ok: true });
  }
});
