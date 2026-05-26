const tabInfo = document.getElementById("tab-info");
const statusElement = document.getElementById("status");
const helloButton = document.getElementById("hello-button");

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateCurrentTabInfo() {
  try {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      tabInfo.textContent = "No active tab found.";
      helloButton.disabled = true;
      return;
    }

    const title = tab.title || "Untitled page";
    tabInfo.textContent = `Current tab: ${title}`;
  } catch (error) {
    tabInfo.textContent = "Failed to read tab info.";
    statusElement.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

helloButton.addEventListener("click", async () => {
  statusElement.textContent = "Sending message...";

  try {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      statusElement.textContent = "No active tab to message.";
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "hello-from-popup"
    });

    if (!response?.ok) {
      statusElement.textContent = "Page did not respond.";
      return;
    }

    statusElement.textContent = `Injected on: ${response.title}`;
  } catch (error) {
    statusElement.textContent =
      "Open a normal http/https page first, then try again.";
    console.error("Failed to send hello message", error);
  }
});

updateCurrentTabInfo();
