async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPageContext(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        url: location.href,
        title: document.title,
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
      screen: `${screen.width} x ${screen.height}`,
      userAgent: navigator.userAgent
      })
    });
    return result?.result || {};
  } catch (error) {
    return {};
  }
}

async function captureCurrentTab(options = {}) {
  const returnTabId = options.returnTabId;
  const tab = options.sourceTabId ? await chrome.tabs.get(options.sourceTabId) : await getActiveTab();
  if (!tab?.id || !tab.windowId) {
    throw new Error("No active tab found.");
  }

  if (options.sourceTabId) {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await wait(175);
  }

  const [screenshot, pageContext] = await Promise.all([
    chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }),
    getPageContext(tab.id)
  ]);

  const payload = {
    screenshot,
    context: {
      url: pageContext.url || tab.url || "",
      title: pageContext.title || tab.title || "",
      viewport: pageContext.viewport || "",
      devicePixelRatio: pageContext.devicePixelRatio || "",
      screen: pageContext.screen || "",
      userAgent: pageContext.userAgent || navigator.userAgent,
      capturedAt: new Date().toISOString(),
      sourceTabId: tab.id,
      sourceWindowId: tab.windowId
    }
  };

  await chrome.storage.session.set({ latestCapture: payload });

  if (returnTabId) {
    await chrome.tabs.update(returnTabId, { active: true });
  }

  if (options.openCapturePage !== false) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") });
  }
}

async function recaptureSource(sender) {
  const { latestCapture } = await chrome.storage.session.get("latestCapture");
  const sourceTabId = latestCapture?.context?.sourceTabId;
  if (!sourceTabId) throw new Error("No source tab found for recapture.");

  await captureCurrentTab({
    sourceTabId,
    returnTabId: sender.tab?.id,
    openCapturePage: false
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "QA_CAPTURE_TAB" && message?.type !== "QA_RECAPTURE_SOURCE") return false;

  const action = message.type === "QA_RECAPTURE_SOURCE" ? recaptureSource(sender) : captureCurrentTab();
  action
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error.message }));

  return true;
});
