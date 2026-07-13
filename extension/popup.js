const captureBtn = document.getElementById("captureBtn");
const openLastBtn = document.getElementById("openLastBtn");
const settingsBtn = document.getElementById("settingsBtn");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

captureBtn.addEventListener("click", async () => {
  setStatus("Capturing...");
  const response = await chrome.runtime.sendMessage({ type: "QA_CAPTURE_TAB" });
  if (!response?.ok) {
    setStatus(response?.error || "Capture failed.");
    return;
  }
  window.close();
});

openLastBtn.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") });
  window.close();
});

settingsBtn.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});
