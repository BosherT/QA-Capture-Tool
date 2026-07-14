const fields = {
  backendUrl: document.getElementById("backendUrlInput"),
  jiraSite: document.getElementById("jiraSiteInput"),
  project: document.getElementById("projectInput"),
  issueType: document.getElementById("issueTypeInput"),
  priority: document.getElementById("priorityInput"),
  parentIssue: document.getElementById("parentIssueInput"),
  assignee: document.getElementById("assigneeInput")
};

const connectorStatus = document.getElementById("connectorStatus");
const settingsStatus = document.getElementById("settingsStatus");
const assigneeOptions = document.getElementById("assigneeOptions");
const statusPanel = {
  brokerItem: document.getElementById("brokerConnectionItem"),
  brokerText: document.getElementById("brokerStatusText"),
  jiraItem: document.getElementById("jiraConnectionItem"),
  jiraText: document.getElementById("jiraStatusText"),
  connectorUrl: document.getElementById("connectorUrlText"),
  jiraSite: document.getElementById("jiraSiteText"),
  authMode: document.getElementById("authModeText")
};
const qaIssueTypeHints = ["task", "sub-task", "subtask", "bug", "defect", "content", "edit"];
const excludedIssueTypeHints = ["epic", "project", "initiative", "theme", "portfolio"];
let assignableUsers = [];
let connectorState = {
  brokerReachable: false,
  connected: false,
  authMode: null,
  siteUrl: ""
};
let connectorPollId = null;

function backendUrl(path) {
  return `${fields.backendUrl.value.replace(/\/$/, "")}${path}`;
}

function backendBaseUrl() {
  return fields.backendUrl.value.replace(/\/$/, "");
}

async function getBrokerSessionToken() {
  const baseUrl = backendBaseUrl();
  const { brokerSessions = {} } = await chrome.storage.local.get("brokerSessions");
  if (brokerSessions[baseUrl]) return brokerSessions[baseUrl];

  try {
    const response = await fetch(`${baseUrl}/auth/session`, { method: "POST" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.session) return null;
    await chrome.storage.local.set({
      brokerSessions: {
        ...brokerSessions,
        [baseUrl]: data.session
      }
    });
    return data.session;
  } catch (error) {
    return null;
  }
}

async function jiraFetch(path, options = {}) {
  const session = await getBrokerSessionToken();
  const headers = {
    ...(options.headers || {})
  };
  if (session) headers["X-QA-Capture-Session"] = session;
  return fetch(backendUrl(path), {
    ...options,
    headers
  });
}

async function jiraAuthStartUrl() {
  const session = await getBrokerSessionToken();
  if (!session) return backendUrl("/auth/start");
  const url = new URL(backendUrl("/auth/start"));
  url.searchParams.set("session", session);
  return url.toString();
}

function debounce(fn, wait = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.classList.remove("error", "success");
  if (kind) element.classList.add(kind);
}

function setConnectionState(item, state) {
  const dot = item.querySelector(".connection-dot");
  item.classList.remove("success", "error", "unknown");
  dot.classList.remove("success", "error", "unknown");
  item.classList.add(state);
  dot.classList.add(state);
}

function updateStatusPanel() {
  const baseUrl = backendBaseUrl();
  const siteUrl = connectorState.siteUrl || fields.jiraSite.value.trim();
  statusPanel.connectorUrl.textContent = baseUrl || "Not set";
  statusPanel.jiraSite.textContent = siteUrl || "Not set";
  statusPanel.authMode.textContent = connectorState.authMode || "Unknown";

  if (connectorState.brokerReachable) {
    setConnectionState(statusPanel.brokerItem, "success");
    statusPanel.brokerText.textContent = "Reachable";
  } else {
    setConnectionState(statusPanel.brokerItem, "error");
    statusPanel.brokerText.textContent = "Not reachable";
  }

  if (connectorState.connected) {
    setConnectionState(statusPanel.jiraItem, "success");
    statusPanel.jiraText.textContent = "Connected";
  } else if (connectorState.brokerReachable) {
    setConnectionState(statusPanel.jiraItem, "error");
    statusPanel.jiraText.textContent = "Not connected";
  } else {
    setConnectionState(statusPanel.jiraItem, "unknown");
    statusPanel.jiraText.textContent = "Waiting for broker";
  }
}

function replaceSelectOptions(select, values, selectedValue) {
  select.innerHTML = "";
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (selectedValue && values.includes(selectedValue)) select.value = selectedValue;
}

function isQaIssueType(issueType) {
  const name = (issueType.name || "").toLowerCase();
  if (excludedIssueTypeHints.some(hint => name.includes(hint))) return false;
  return issueType.subtask || qaIssueTypeHints.some(hint => name.includes(hint));
}

function focusedIssueTypes(issueTypes) {
  const filtered = issueTypes.filter(isQaIssueType);
  return filtered.length ? filtered : issueTypes.filter(issueType => !excludedIssueTypeHints.some(hint => (issueType.name || "").toLowerCase().includes(hint)));
}

function assigneeDisplayName(user) {
  return [user.displayName, user.emailAddress].filter(Boolean).join(" - ");
}

function setAssigneeOptions(users) {
  assigneeOptions.innerHTML = "";
  users.forEach(user => {
    const option = document.createElement("option");
    option.value = assigneeDisplayName(user);
    option.label = user.emailAddress || "";
    assigneeOptions.appendChild(option);
  });
}

async function loadSettings() {
  const { jiraDefaults = {} } = await chrome.storage.local.get("jiraDefaults");
  if (jiraDefaults.backendUrl) fields.backendUrl.value = jiraDefaults.backendUrl;
  if (jiraDefaults.jiraSite) fields.jiraSite.value = jiraDefaults.jiraSite;
  if (jiraDefaults.project) fields.project.value = jiraDefaults.project;
  if (jiraDefaults.parentIssue) fields.parentIssue.value = jiraDefaults.parentIssue;
  if (jiraDefaults.issueType) replaceSelectOptions(fields.issueType, [jiraDefaults.issueType], jiraDefaults.issueType);
  if (jiraDefaults.priority) fields.priority.value = jiraDefaults.priority;
  updateStatusPanel();
}

async function saveSettings() {
  const { jiraDefaults = {} } = await chrome.storage.local.get("jiraDefaults");
  const { assigneeLabel, assigneeAccountId, ...defaultsWithoutAssignee } = jiraDefaults;
  await chrome.storage.local.set({
    jiraDefaults: {
      ...defaultsWithoutAssignee,
      backendUrl: fields.backendUrl.value.trim(),
      jiraSite: fields.jiraSite.value.trim(),
      project: fields.project.value.trim(),
      issueType: fields.issueType.value,
      parentIssue: fields.parentIssue.value.trim(),
      priority: fields.priority.value
    }
  });
  setStatus(settingsStatus, "Settings saved.", "success");
}

async function testConnector() {
  setStatus(connectorStatus, "Checking connector...");
  try {
    const response = await jiraFetch("/auth/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Connector check failed.");
    connectorState = {
      brokerReachable: true,
      connected: Boolean(data.connected),
      authMode: data.authMode || null,
      siteUrl: data.sites?.[0]?.url || fields.jiraSite.value.trim()
    };
    if (!fields.jiraSite.value && data.sites?.[0]?.url) fields.jiraSite.value = data.sites[0].url;
    updateStatusPanel();
    const mode = data.authMode ? ` ${data.authMode} mode.` : "";
    const connected = data.connected ? "Jira connector is ready." : "Connector is running, but Jira is not connected.";
    setStatus(connectorStatus, `${connected}${mode}`, data.connected ? "success" : "error");
  } catch (error) {
    connectorState = {
      brokerReachable: false,
      connected: false,
      authMode: null,
      siteUrl: fields.jiraSite.value.trim()
    };
    updateStatusPanel();
    setStatus(connectorStatus, "Local Jira connector is not running.", "error");
  }
}

function startConnectorPolling() {
  if (connectorPollId) clearInterval(connectorPollId);
  let attempts = 0;
  connectorPollId = setInterval(async () => {
    attempts += 1;
    await testConnector();
    if (connectorState.connected || attempts >= 30) {
      clearInterval(connectorPollId);
      connectorPollId = null;
    }
  }, 2000);
}

async function connectJira() {
  setStatus(connectorStatus, "Checking Jira connection...");
  await testConnector();
  if (connectorState.connected) {
    setStatus(connectorStatus, "Jira is already connected.", "success");
    return;
  }
  if (connectorState.authMode === "apiToken") {
    setStatus(connectorStatus, "API token mode is enabled; OAuth sign-in is not needed.", "success");
    return;
  }
  setStatus(connectorStatus, "Opening Atlassian sign-in...");
  await chrome.tabs.create({ url: await jiraAuthStartUrl() });
  startConnectorPolling();
}

async function disconnectJira() {
  setStatus(connectorStatus, "Disconnecting Jira...");
  try {
    const response = await jiraFetch("/auth/disconnect", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not disconnect Jira.");
    connectorState = {
      brokerReachable: true,
      connected: false,
      authMode: data.authMode || null,
      siteUrl: fields.jiraSite.value.trim()
    };
    updateStatusPanel();
    setStatus(connectorStatus, "Jira disconnected. Connect again when you are ready.", "success");
  } catch (error) {
    setStatus(connectorStatus, error.message || "Could not disconnect Jira.", "error");
  }
}

async function loadIssueTypes() {
  const projectKey = fields.project.value.trim();
  if (!projectKey) {
    setStatus(settingsStatus, "Enter a project key first.", "error");
    return;
  }
  setStatus(settingsStatus, `Loading issue types for ${projectKey}...`);
  const params = new URLSearchParams({ projectKey, site: fields.jiraSite.value.trim() });
  const response = await jiraFetch(`/jira/project-meta?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setStatus(settingsStatus, data.error || "Could not load issue types.", "error");
    return;
  }
  const issueTypes = focusedIssueTypes(data.issueTypes || []).map(issueType => issueType.name);
  replaceSelectOptions(fields.issueType, issueTypes, fields.issueType.value || "Task");
  setStatus(settingsStatus, `Loaded ${issueTypes.length} QA issue types for ${data.key}.`, "success");
  await saveSettings();
}

async function searchAssignableUsers() {
  const projectKey = fields.project.value.trim();
  if (!projectKey) {
    setStatus(settingsStatus, "Enter a project key before searching assignees.", "error");
    return;
  }
  const params = new URLSearchParams({
    projectKey,
    q: fields.assignee.value.trim(),
    site: fields.jiraSite.value.trim()
  });
  const response = await jiraFetch(`/jira/assignable-users?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setStatus(settingsStatus, data.error || "Could not search assignees.", "error");
    return;
  }
  assignableUsers = data.users || [];
  setAssigneeOptions(assignableUsers);
}

document.getElementById("testConnectorBtn").addEventListener("click", testConnector);
document.getElementById("connectJiraBtn").addEventListener("click", () => connectJira().catch(error => setStatus(connectorStatus, error.message, "error")));
document.getElementById("disconnectJiraBtn").addEventListener("click", () => disconnectJira().catch(error => setStatus(connectorStatus, error.message, "error")));
document.getElementById("loadIssueTypesBtn").addEventListener("click", () => loadIssueTypes().catch(error => setStatus(settingsStatus, error.message, "error")));
document.getElementById("saveSettingsBtn").addEventListener("click", () => saveSettings().catch(error => setStatus(settingsStatus, error.message, "error")));
document.getElementById("openCaptureBtn").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") }));
fields.backendUrl.addEventListener("input", updateStatusPanel);
fields.jiraSite.addEventListener("input", updateStatusPanel);
fields.assignee.addEventListener("input", debounce(() => searchAssignableUsers().catch(error => setStatus(settingsStatus, error.message, "error"))));
fields.assignee.addEventListener("focus", () => searchAssignableUsers().catch(error => setStatus(settingsStatus, error.message, "error")));
window.addEventListener("focus", () => {
  testConnector().catch(error => setStatus(connectorStatus, error.message, "error"));
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) testConnector().catch(error => setStatus(connectorStatus, error.message, "error"));
});

loadSettings()
  .then(testConnector)
  .catch(error => setStatus(settingsStatus, error.message, "error"));
