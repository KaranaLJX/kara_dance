const BANNER_ID = "hello-world-extension-banner";

function ensureBanner(message) {
  let banner = document.getElementById(BANNER_ID);

  if (!banner) {
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.style.position = "fixed";
    banner.style.right = "16px";
    banner.style.bottom = "16px";
    banner.style.zIndex = "2147483647";
    banner.style.padding = "10px 14px";
    banner.style.borderRadius = "8px";
    banner.style.background = "#111827";
    banner.style.color = "#ffffff";
    banner.style.fontSize = "14px";
    banner.style.fontFamily = "Arial, sans-serif";
    banner.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.2)";
    document.body.appendChild(banner);
  }

  banner.textContent = message;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hello-from-popup") {
    return;
  }

  const title = document.title || "Untitled page";
  ensureBanner(`Hello from the extension: ${title}`);

  sendResponse({
    ok: true,
    title,
    url: window.location.href
  });
});
