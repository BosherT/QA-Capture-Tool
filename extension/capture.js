const imageCanvas = document.getElementById("imageCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const imageCtx = imageCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");
const stage = document.getElementById("stage");
const emptyState = document.getElementById("emptyState");
const imageMeta = document.getElementById("imageMeta");
const issueList = document.getElementById("issueList");
const toast = document.getElementById("toast");
const colors = ["#e11d48", "#f59e0b", "#10b981", "#0ea5e9", "#6d5bd0", "#111827"];

const state = {
  tool: "rect",
  color: colors[0],
  annotations: [],
  issues: [],
  drawing: null,
  draggingAnnotation: null,
  resizingAnnotation: null,
  selectedAnnotationIndex: null,
  imageName: "tab-capture.png",
  zoom: 1,
  screenshot: null,
  jiraIssueTypes: [],
  dynamicFieldValues: {},
  extraAttachments: [],
  captureStepCount: 1,
  assignableUsers: [],
  jiraConnection: {
    connected: false,
    authMode: null,
    sites: []
  }
};

const fields = {
  summary: document.getElementById("summaryInput"),
  description: document.getElementById("descriptionInput"),
  url: document.getElementById("urlInput"),
  title: document.getElementById("titleInput"),
  browser: document.getElementById("browserInput"),
  viewport: document.getElementById("viewportInput"),
  jiraSite: document.getElementById("jiraSiteInput"),
  backendUrl: document.getElementById("backendUrlInput"),
  project: document.getElementById("projectInput"),
  issueType: document.getElementById("issueTypeInput"),
  parentIssue: document.getElementById("parentIssueInput"),
  priority: document.getElementById("priorityInput"),
  assignee: document.getElementById("assigneeInput"),
  extraAttachment: document.getElementById("extraAttachmentInput")
};
const connectJiraBtn = document.getElementById("connectJiraBtn");
const jiraStatus = document.getElementById("jiraStatus");
const parentIssueField = document.getElementById("parentIssueField");
const dynamicJiraFields = document.getElementById("dynamicJiraFields");
const projectOptions = document.getElementById("projectOptions");
const parentIssueOptions = document.getElementById("parentIssueOptions");
const assigneeOptions = document.getElementById("assigneeOptions");
const standardJiraFieldIds = new Set(["project", "issuetype", "summary", "description", "parent", "priority", "labels", "reporter", "assignee"]);
const createdIssuePanel = document.getElementById("createdIssuePanel");
const createdIssueKey = document.getElementById("createdIssueKey");
const createdIssueUrl = document.getElementById("createdIssueUrl");
const openCreatedIssueBtn = document.getElementById("openCreatedIssueBtn");
const copyCreatedIssueKeyBtn = document.getElementById("copyCreatedIssueKeyBtn");
const clearIssuesBtn = document.getElementById("clearIssuesBtn");
const jiraPreviewSummary = document.getElementById("jiraPreviewSummary");
const jiraPreviewTarget = document.getElementById("jiraPreviewTarget");
const jiraPreviewDescription = document.getElementById("jiraPreviewDescription");
const jiraPreviewAttachment = document.getElementById("jiraPreviewAttachment");
const jiraValidationList = document.getElementById("jiraValidationList");
const extraAttachmentList = document.getElementById("extraAttachmentList");
const descriptionEditor = document.getElementById("descriptionEditor");
const qaIssueTypeHints = ["task", "sub-task", "subtask", "bug", "defect", "content", "edit"];
const excludedIssueTypeHints = ["epic", "project", "initiative", "theme", "portfolio"];
let jiraConnectionPollId = null;

function debounce(fn, wait = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataUrlSize(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.floor(base64.length * 3 / 4);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function clearAnnotationState() {
  state.annotations = [];
  state.drawing = null;
  state.draggingAnnotation = null;
  state.resizingAnnotation = null;
  state.selectedAnnotationIndex = null;
  renderAnnotations();
}

function fitCanvas(width, height) {
  for (const canvas of [imageCanvas, drawCanvas]) {
    canvas.width = width;
    canvas.height = height;
  }
  state.imageWidth = width;
  state.imageHeight = height;
  renderAnnotations();
  updateZoom();
}

function setImageFromSource(src, name = "tab-capture.png") {
  const img = new Image();
  img.onload = () => {
    const maxWidth = 1800;
    const ratio = Math.min(1, maxWidth / img.width);
    const width = Math.round(img.width * ratio);
    const height = Math.round(img.height * ratio);
    fitCanvas(width, height);
    imageCtx.clearRect(0, 0, width, height);
    imageCtx.drawImage(img, 0, 0, width, height);
    state.imageName = name;
    state.screenshot = src;
    emptyState.classList.add("hidden");
    imageMeta.textContent = `${name} - ${width} x ${height}`;
  };
  img.src = src;
}

function getPoint(event) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * drawCanvas.width / rect.width,
    y: (event.clientY - rect.top) * drawCanvas.height / rect.height
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawAnnotation(ctx, item, index, selected = false) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = item.tool === "highlight" ? 18 : 4;
  ctx.globalAlpha = item.tool === "highlight" ? .34 : 1;

  if (item.tool === "pin") {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(item.x, item.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), item.x, item.y + 1);
  }

  if (item.tool === "text") {
    ctx.globalAlpha = 1;
    ctx.font = "bold 18px system-ui, sans-serif";
    const paddingX = 10;
    const paddingY = 7;
    const metrics = ctx.measureText(item.text);
    const width = metrics.width + paddingX * 2;
    const height = 34;
    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundedRect(ctx, item.x, item.y, width, height, 7);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(item.text, item.x + paddingX, item.y + height / 2 + 1);
  }

  if (item.tool === "rect") ctx.strokeRect(item.x, item.y, item.w, item.h);

  if (item.tool === "arrow") {
    const angle = Math.atan2(item.y2 - item.y, item.x2 - item.x);
    ctx.beginPath();
    ctx.moveTo(item.x, item.y);
    ctx.lineTo(item.x2, item.y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(item.x2, item.y2);
    ctx.lineTo(item.x2 - 18 * Math.cos(angle - Math.PI / 6), item.y2 - 18 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(item.x2 - 18 * Math.cos(angle + Math.PI / 6), item.y2 - 18 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  if (item.tool === "pen" || item.tool === "highlight") {
    ctx.beginPath();
    item.points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  ctx.restore();
  if (selected) drawSelection(ctx, item);
}

function renderAnnotations() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  state.annotations.forEach((item, index) => drawAnnotation(drawCtx, item, index, index === state.selectedAnnotationIndex));
}

function annotationBounds(item) {
  if (item.tool === "pin") return { x: item.x - 18, y: item.y - 18, w: 36, h: 36 };
  if (item.tool === "text") {
    drawCtx.save();
    drawCtx.font = "bold 18px system-ui, sans-serif";
    const width = drawCtx.measureText(item.text || "").width + 20;
    drawCtx.restore();
    return { x: item.x, y: item.y, w: width, h: 34 };
  }
  if (item.tool === "rect") {
    const x = Math.min(item.x, item.x + item.w);
    const y = Math.min(item.y, item.y + item.h);
    return { x, y, w: Math.abs(item.w), h: Math.abs(item.h) };
  }
  if (item.tool === "arrow") {
    const x = Math.min(item.x, item.x2);
    const y = Math.min(item.y, item.y2);
    return { x, y, w: Math.abs(item.x2 - item.x), h: Math.abs(item.y2 - item.y) };
  }
  if (item.points?.length) {
    const xs = item.points.map(point => point.x);
    const ys = item.points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function rectResizeHandles(item) {
  const bounds = annotationBounds(item);
  const padding = 8;
  return [
    { name: "nw", x: bounds.x - padding, y: bounds.y - padding },
    { name: "ne", x: bounds.x + bounds.w + padding, y: bounds.y - padding },
    { name: "se", x: bounds.x + bounds.w + padding, y: bounds.y + bounds.h + padding },
    { name: "sw", x: bounds.x - padding, y: bounds.y + bounds.h + padding }
  ];
}

function drawSelection(ctx, item) {
  const bounds = annotationBounds(item);
  const padding = 8;
  ctx.save();
  ctx.strokeStyle = "#007f7a";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(bounds.x - padding, bounds.y - padding, bounds.w + padding * 2, bounds.h + padding * 2);
  if (item.tool === "rect") {
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    for (const handle of rectResizeHandles(item)) {
      ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10);
      ctx.strokeRect(handle.x - 5, handle.y - 5, 10, 10);
    }
  }
  ctx.restore();
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function isPointNearAnnotation(point, item) {
  const tolerance = 10;
  if (item.tool === "pin") return Math.hypot(point.x - item.x, point.y - item.y) <= 22;
  if (item.tool === "text") {
    const bounds = annotationBounds(item);
    return point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.w + tolerance
      && point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.h + tolerance;
  }
  if (item.tool === "rect") {
    const bounds = annotationBounds(item);
    const nearLeft = Math.abs(point.x - bounds.x) <= tolerance && point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.h + tolerance;
    const nearRight = Math.abs(point.x - (bounds.x + bounds.w)) <= tolerance && point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.h + tolerance;
    const nearTop = Math.abs(point.y - bounds.y) <= tolerance && point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.w + tolerance;
    const nearBottom = Math.abs(point.y - (bounds.y + bounds.h)) <= tolerance && point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.w + tolerance;
    return nearLeft || nearRight || nearTop || nearBottom;
  }
  if (item.tool === "arrow") return distanceToSegment(point, { x: item.x, y: item.y }, { x: item.x2, y: item.y2 }) <= tolerance;
  if (item.points?.length > 1) {
    for (let i = 1; i < item.points.length; i += 1) {
      if (distanceToSegment(point, item.points[i - 1], item.points[i]) <= tolerance) return true;
    }
  }
  return false;
}

function resizeHandleAt(point, item) {
  if (!item || item.tool !== "rect") return null;
  const hitSize = 8;
  return rectResizeHandles(item).find(handle => (
    point.x >= handle.x - hitSize
    && point.x <= handle.x + hitSize
    && point.y >= handle.y - hitSize
    && point.y <= handle.y + hitSize
  ))?.name || null;
}

function selectAnnotationAt(point) {
  for (let i = state.annotations.length - 1; i >= 0; i -= 1) {
    if (isPointNearAnnotation(point, state.annotations[i])) {
      state.selectedAnnotationIndex = i;
      renderAnnotations();
      return i;
    }
  }
  state.selectedAnnotationIndex = null;
  renderAnnotations();
  return null;
}

function moveAnnotation(item, dx, dy) {
  if (item.tool === "pin" || item.tool === "text") {
    item.x += dx;
    item.y += dy;
    return;
  }
  if (item.tool === "rect") {
    item.x += dx;
    item.y += dy;
    return;
  }
  if (item.tool === "arrow") {
    item.x += dx;
    item.y += dy;
    item.x2 += dx;
    item.y2 += dy;
    return;
  }
  if (item.points?.length) {
    item.points.forEach(point => {
      point.x += dx;
      point.y += dy;
    });
  }
}

function resizeRectAnnotation(item, handle, point) {
  const bounds = annotationBounds(item);
  const minSize = 12;
  let left = bounds.x;
  let right = bounds.x + bounds.w;
  let top = bounds.y;
  let bottom = bounds.y + bounds.h;

  if (handle.includes("w")) left = Math.min(point.x, right - minSize);
  if (handle.includes("e")) right = Math.max(point.x, left + minSize);
  if (handle.includes("n")) top = Math.min(point.y, bottom - minSize);
  if (handle.includes("s")) bottom = Math.max(point.y, top + minSize);

  item.x = left;
  item.y = top;
  item.w = right - left;
  item.h = bottom - top;
}

function updateCanvasCursor(point) {
  if (state.tool !== "select") {
    drawCanvas.style.cursor = "crosshair";
    return;
  }
  const selected = state.annotations[state.selectedAnnotationIndex];
  const handle = resizeHandleAt(point, selected);
  if (handle === "nw" || handle === "se") {
    drawCanvas.style.cursor = "nwse-resize";
    return;
  }
  if (handle === "ne" || handle === "sw") {
    drawCanvas.style.cursor = "nesw-resize";
    return;
  }
  drawCanvas.style.cursor = selected && isPointNearAnnotation(point, selected) ? "move" : "default";
}

function deleteSelectedAnnotation() {
  if (state.selectedAnnotationIndex == null) return;
  state.annotations.splice(state.selectedAnnotationIndex, 1);
  state.selectedAnnotationIndex = null;
  renderAnnotations();
}

function editTextAnnotationAt(point) {
  const index = selectAnnotationAt(point);
  const annotation = index == null ? null : state.annotations[index];
  if (!annotation || annotation.tool !== "text") return;
  const nextText = prompt("Edit text callout", annotation.text || "");
  if (!nextText?.trim()) return;
  annotation.text = nextText.trim();
  renderAnnotations();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function syncDescriptionField() {
  fields.description.value = descriptionEditor.innerText.trim();
  fields.description.dataset.html = descriptionEditor.innerHTML;
}

function setDescriptionEditor(html = "") {
  descriptionEditor.innerHTML = html;
  syncDescriptionField();
}

function descriptionTextFromHtml(html) {
  const element = document.createElement("div");
  element.innerHTML = html || "";
  return element.innerText.trim();
}

function renderIssues() {
  issueList.innerHTML = "";
  if (state.issues.length === 0) {
    issueList.innerHTML = '<p style="color: var(--muted); margin: 0;">No issues yet.</p>';
    return;
  }

  state.issues.forEach((issue, index) => {
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `
      <div class="issue-top">
        <div class="issue-title">${index + 1}. ${escapeHtml(issue.summary)}</div>
      </div>
      <p>${escapeHtml(issue.description || "No description added")}</p>
    `;
    card.addEventListener("click", () => {
      fields.summary.value = issue.summary;
      setDescriptionEditor(issue.descriptionHtml || escapeHtml(issue.description || ""));
      document.querySelectorAll(".issue-card").forEach(el => el.classList.remove("active"));
      card.classList.add("active");
      renderJiraPreview();
    });
    issueList.appendChild(card);
  });
}

function addIssue() {
  syncDescriptionField();
  const summary = fields.summary.value.trim() || `Issue ${state.issues.length + 1}`;
  state.issues.push({
    id: crypto.randomUUID(),
    summary,
    description: fields.description.value.trim(),
    descriptionHtml: fields.description.dataset.html || "",
    createdAt: new Date().toISOString(),
    annotationCount: state.annotations.length
  });
  fields.summary.value = "";
  setDescriptionEditor("");
  renderIssues();
  renderJiraPreview();
  showToast("Issue added");
}

function clearCurrentIssues() {
  state.issues = [];
  renderIssues();
  renderJiraPreview();
  hideCreatedIssue();
  showToast("Issues cleared");
}

function renderExtraAttachments() {
  extraAttachmentList.innerHTML = "";
  for (const attachment of state.extraAttachments) {
    const row = document.createElement("div");
    row.className = "attachment-row";
    const label = document.createElement("span");
    label.title = attachment.filename;
    label.textContent = attachment.filename;
    const meta = document.createElement("small");
    meta.textContent = [attachment.source === "capture-step" ? "captured screenshot" : "", formatFileSize(attachment.size || 0)].filter(Boolean).join(" - ");
    label.appendChild(document.createTextNode(" "));
    label.appendChild(meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.extraAttachments = state.extraAttachments.filter(item => item.id !== attachment.id);
      renderExtraAttachments();
      renderJiraPreview();
    });
    row.appendChild(label);
    row.appendChild(remove);
    extraAttachmentList.appendChild(row);
  }
}

async function addExtraAttachments(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return;
  setJiraStatus(`Adding ${selectedFiles.length} attachment${selectedFiles.length === 1 ? "" : "s"}...`);
  for (const file of selectedFiles) {
    const dataUrl = await fileToDataUrl(file);
    state.extraAttachments.push({
      id: crypto.randomUUID(),
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl
    });
  }
  fields.extraAttachment.value = "";
  renderExtraAttachments();
  renderJiraPreview();
  setJiraStatus(`Added ${selectedFiles.length} attachment${selectedFiles.length === 1 ? "" : "s"}.`);
}

function archiveCurrentScreenshotAttachment() {
  if (!state.screenshot) return null;
  const dataUrl = annotatedPngDataUrl();
  const stepNumber = state.captureStepCount;
  const attachment = {
    id: crypto.randomUUID(),
    filename: `qa-capture-step-${stepNumber}.png`,
    contentType: "image/png",
    size: dataUrlSize(dataUrl),
    dataUrl,
    source: "capture-step"
  };
  state.extraAttachments.push(attachment);
  state.captureStepCount += 1;
  renderExtraAttachments();
  renderJiraPreview();
  return attachment;
}

function annotatedPngDataUrl() {
  const output = document.createElement("canvas");
  output.width = imageCanvas.width;
  output.height = imageCanvas.height;
  const ctx = output.getContext("2d");
  ctx.drawImage(imageCanvas, 0, 0);
  ctx.drawImage(drawCanvas, 0, 0);
  return output.toDataURL("image/png");
}

function buildReport() {
  syncDescriptionField();
  const issues = state.issues.length ? state.issues : [{
    summary: fields.summary.value.trim() || "Untitled issue",
    description: fields.description.value.trim(),
    descriptionHtml: fields.description.dataset.html || ""
  }];

  return [
    `Page: ${fields.url.value || "Not specified"}`,
    `Title: ${fields.title.value || "Not specified"}`,
    "",
    "Issues:",
    ...issues.map(issue => issue.description || "No description added"),
    "",
    "Environment info:",
    `Browser: ${fields.browser.value || "Not specified"}`,
    `Viewport: ${fields.viewport.value || "Not specified"}`
  ].join("\n");
}

function browserLabel(userAgent) {
  const ua = userAgent || "";
  const edge = ua.match(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge[1]}`;
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const firefox = ua.match(/Firefox\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return ua || "Not specified";
}

function textNode(text, marks = []) {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

function paragraph(content) {
  return { type: "paragraph", content };
}

function heading(text, level = 3) {
  return { type: "heading", attrs: { level }, content: [textNode(text)] };
}

function marksForNode(node, inheritedMarks = []) {
  const marks = [...inheritedMarks];
  const tag = node.nodeName.toLowerCase();
  if (tag === "strong" || tag === "b") marks.push({ type: "strong" });
  if (tag === "u") marks.push({ type: "underline" });
  return marks;
}

function inlineAdfFromNode(node, inheritedMarks = []) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [textNode(node.textContent, inheritedMarks)] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  if (node.nodeName.toLowerCase() === "br") return [{ type: "hardBreak" }];
  const marks = marksForNode(node, inheritedMarks);
  return Array.from(node.childNodes).flatMap(child => inlineAdfFromNode(child, marks));
}

function paragraphFromElement(element) {
  const content = inlineAdfFromNode(element).filter(node => node.type !== "text" || node.text !== "");
  return paragraph(content.length ? content : [textNode("")]);
}

function listFromElement(element, type) {
  const items = Array.from(element.children)
    .filter(child => child.nodeName.toLowerCase() === "li")
    .map(child => ({
      type: "listItem",
      content: [paragraphFromElement(child)]
    }));
  const list = { type, content: items.length ? items : [{ type: "listItem", content: [paragraph([textNode("")])] }] };
  if (type === "orderedList") list.attrs = { order: 1 };
  return list;
}

function nodeContainsList(node) {
  return node.nodeType === Node.ELEMENT_NODE && Boolean(node.querySelector?.("ul, ol"));
}

function adfBlocksFromNodes(nodes) {
  const blocks = [];
  let inlineBuffer = [];

  const flushInline = () => {
    const content = inlineBuffer
      .flatMap(node => inlineAdfFromNode(node))
      .filter(node => node.type !== "text" || node.text.trim() !== "");
    if (content.length) blocks.push(paragraph(content));
    inlineBuffer = [];
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) inlineBuffer.push(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.nodeName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      flushInline();
      blocks.push(listFromElement(node, tag === "ul" ? "bulletList" : "orderedList"));
      continue;
    }
    if ((tag === "div" || tag === "p") && nodeContainsList(node)) {
      flushInline();
      blocks.push(...adfBlocksFromNodes(Array.from(node.childNodes)));
      continue;
    }
    if (tag === "div" || tag === "p") {
      flushInline();
      blocks.push(paragraphFromElement(node));
      continue;
    }
    inlineBuffer.push(node);
  }

  flushInline();
  return blocks;
}

function descriptionHtmlToAdfBlocks(html) {
  const text = descriptionTextFromHtml(html);
  if (!text) return [paragraph([textNode("No description added")])];
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const blocks = adfBlocksFromNodes(Array.from(doc.body.childNodes));
  return blocks.length ? blocks : [paragraph([textNode(text)])];
}

function buildReportAdf() {
  syncDescriptionField();
  const issues = state.issues.length ? state.issues : [{
    summary: fields.summary.value.trim() || "Untitled issue",
    description: fields.description.value.trim(),
    descriptionHtml: fields.description.dataset.html || ""
  }];
  const pageUrl = fields.url.value || "";
  const browser = fields.browser.value || "Not specified";
  const viewport = fields.viewport.value || "Not specified";
  const dpr = state.devicePixelRatio ? String(state.devicePixelRatio) : "Not specified";
  const screenSize = state.screenSize || "Not specified";
  const content = [];

  content.push(heading("Capture context", 3));
  content.push(paragraph([textNode("Page: "), pageUrl ? textNode(pageUrl, [{ type: "link", attrs: { href: pageUrl } }]) : textNode("Not specified")]));
  content.push(paragraph([textNode(`Title: ${fields.title.value || "Not specified"}`)]));

  content.push(heading("Issue", 3));
  issues.forEach(issue => {
    content.push(...descriptionHtmlToAdfBlocks(issue.descriptionHtml || escapeHtml(issue.description || "")));
  });
  content.push(heading("Environment info", 3));
  content.push(paragraph([textNode(`Browser: ${browser}`)]));
  content.push(paragraph([textNode(`Viewport: ${viewport} | DPR: ${dpr} | Screen: ${screenSize}`)]));

  return { type: "doc", version: 1, content };
}

function buildJiraPayload() {
  const primaryIssue = primaryIssueDraft();
  const screenshotAttachment = {
    filename: state.imageName,
    contentType: "image/png",
    dataUrl: annotatedPngDataUrl()
  };
  const jiraFields = {
    project: { key: fields.project.value },
    issuetype: { name: fields.issueType.value || "Task" },
    priority: { name: fields.priority.value },
    summary: primaryIssue.summary,
    description: buildReportAdf(),
    labels: ["qa-capture"]
  };
  const parentKey = fields.parentIssue.value.trim();
  if (parentKey) jiraFields.parent = { key: parentKey };
  const assignee = selectedAssignee();
  if (assignee?.accountId) jiraFields.assignee = { accountId: assignee.accountId };
  Object.assign(jiraFields, buildDynamicJiraFields());

  return {
    site: fields.jiraSite.value,
    request: {
      fields: jiraFields
    },
    attachment: screenshotAttachment,
    attachments: [screenshotAttachment, ...state.extraAttachments]
  };
}

function buildDynamicJiraFields() {
  const values = {};
  for (const field of selectedExtraRequiredFields()) {
    const input = dynamicJiraFields.querySelector(`[data-jira-field-id="${field.id}"]`);
    if (!input || !input.value.trim()) continue;
    values[field.id] = formatDynamicFieldValue(field, input.value.trim());
  }
  return values;
}

function formatDynamicFieldValue(field, value) {
  if (field.allowedValues?.length) {
    const match = field.allowedValues.find(option => option.id === value || option.name === value || option.value === value || option.key === value);
    if (match?.id) return { id: match.id };
    if (match?.value) return { value: match.value };
    return { name: value };
  }
  if (field.schema?.type === "number") return Number(value);
  if (field.schema?.type === "array") return value.split(",").map(item => item.trim()).filter(Boolean);
  return value;
}

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

function setDatalistOptions(datalist, rows, getValue, getLabel) {
  datalist.innerHTML = "";
  rows.forEach(row => {
    const option = document.createElement("option");
    option.value = getValue(row);
    option.label = getLabel(row);
    datalist.appendChild(option);
  });
}

function assigneeDisplayName(user) {
  return [user.displayName, user.emailAddress].filter(Boolean).join(" - ");
}

function selectedAssignee() {
  const value = fields.assignee.value.trim();
  if (!value) return null;
  return state.assignableUsers.find(user => (
    user.accountId === value
    || user.displayName === value
    || user.emailAddress === value
    || assigneeDisplayName(user) === value
  )) || null;
}

function setJiraStatus(message) {
  jiraStatus.textContent = message;
  jiraStatus.classList.remove("error", "success");
}

function setJiraError(message) {
  jiraStatus.textContent = message;
  jiraStatus.classList.add("error");
  jiraStatus.classList.remove("success");
}

function setJiraSuccess(message) {
  jiraStatus.textContent = message;
  jiraStatus.classList.add("success");
  jiraStatus.classList.remove("error");
}

function updateConnectJiraButton() {
  if (!connectJiraBtn) return;
  const isConnected = Boolean(state.jiraConnection.connected);
  connectJiraBtn.textContent = isConnected ? "Jira connected" : "Connect Jira";
  connectJiraBtn.classList.toggle("connected", isConnected);
  connectJiraBtn.setAttribute("aria-pressed", isConnected ? "true" : "false");
  connectJiraBtn.title = isConnected
    ? "Jira is connected. Click to refresh the connection status."
    : "Connect to Jira through Atlassian.";
}

function jiraFieldLabel(fieldId) {
  const standardNames = {
    project: "Project",
    issuetype: "Issue type",
    summary: "Summary",
    description: "Description",
    parent: "Parent issue",
    priority: "Priority",
    assignee: "Assignee",
    labels: "Labels",
    reporter: "Reporter"
  };
  if (standardNames[fieldId]) return standardNames[fieldId];
  for (const issueType of state.jiraIssueTypes) {
    const match = issueType.requiredFields?.find(field => field.id === fieldId);
    if (match?.name) return match.name;
  }
  return fieldId;
}

function formatJiraCreateError(data) {
  const details = data.details?.errors
    ? Object.entries(data.details.errors).map(([field, message]) => `${jiraFieldLabel(field)}: ${message}`)
    : [];
  const messages = data.details?.errorMessages || [];
  return [data.error || "Jira issue creation failed.", ...messages, ...details].filter(Boolean).join(" ");
}

function hideCreatedIssue() {
  createdIssuePanel.classList.add("hidden");
  openCreatedIssueBtn.dataset.url = "";
  copyCreatedIssueKeyBtn.dataset.key = "";
}

function showCreatedIssue(issue) {
  createdIssueKey.textContent = `Created ${issue.key}`;
  createdIssueUrl.textContent = issue.url;
  openCreatedIssueBtn.dataset.url = issue.url;
  copyCreatedIssueKeyBtn.dataset.key = issue.key;
  createdIssuePanel.classList.remove("hidden");
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

function selectedIssueTypeMetadata() {
  return state.jiraIssueTypes.find(candidate => candidate.name === fields.issueType.value);
}

function selectedExtraRequiredFields() {
  return (selectedIssueTypeMetadata()?.requiredFields || [])
    .filter(field => !standardJiraFieldIds.has(field.id))
    .filter(field => field.name !== "Work instructions" && field.name !== "Description");
}

function primaryIssueDraft() {
  syncDescriptionField();
  return state.issues[0] || {
    summary: fields.summary.value.trim() || "Untitled bug",
    description: fields.description.value.trim(),
    descriptionHtml: fields.description.dataset.html || ""
  };
}

function currentIssuesForPreview() {
  syncDescriptionField();
  return state.issues.length ? state.issues : [{
    summary: fields.summary.value.trim() || "Untitled issue",
    description: fields.description.value.trim(),
    descriptionHtml: fields.description.dataset.html || ""
  }];
}

function fieldWrapper(input) {
  return input?.closest?.(".field") || null;
}

function setFieldInvalid(input, invalid) {
  const wrapper = fieldWrapper(input);
  if (wrapper) wrapper.classList.toggle("invalid", invalid);
}

function validateJiraDraft() {
  const missing = [];
  setFieldInvalid(fields.jiraSite, false);
  setFieldInvalid(fields.project, false);
  setFieldInvalid(fields.parentIssue, false);

  if (!fields.jiraSite.value.trim()) {
    missing.push("Jira site URL");
    setFieldInvalid(fields.jiraSite, true);
  }
  if (!fields.project.value.trim()) {
    missing.push("Project key");
    setFieldInvalid(fields.project, true);
  }
  if (isSelectedSubtask() && !fields.parentIssue.value.trim()) {
    missing.push("Parent issue key");
    setFieldInvalid(fields.parentIssue, true);
  }
  for (const field of selectedExtraRequiredFields()) {
    const input = dynamicJiraFields.querySelector(`[data-jira-field-id="${field.id}"]`);
    const isMissing = !input?.value.trim();
    setFieldInvalid(input, isMissing);
    if (isMissing) missing.push(field.name);
  }

  return missing;
}

function renderJiraPreview() {
  if (!jiraPreviewSummary) return;
  const primaryIssue = primaryIssueDraft();
  const issues = currentIssuesForPreview();
  const issueType = fields.issueType.value || "Task";
  const project = fields.project.value.trim() || "Project not selected";
  const parent = fields.parentIssue.value.trim();
  const assignee = selectedAssignee();
  const description = issues
    .map((issue, index) => `${issues.length > 1 ? `${index + 1}. ` : ""}${issue.description || "No description added"}`)
    .join("\n");
  const missing = validateJiraDraft();

  jiraPreviewSummary.textContent = primaryIssue.summary;
  jiraPreviewTarget.textContent = [project, issueType, parent ? `Parent ${parent}` : "", assignee ? `Assigned to ${assignee.displayName}` : "Unassigned"].filter(Boolean).join(" / ");
  jiraPreviewDescription.textContent = description;
  const attachmentCount = (state.screenshot ? 1 : 0) + state.extraAttachments.length;
  jiraPreviewAttachment.textContent = attachmentCount
    ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
    : "No screenshot";
  jiraValidationList.innerHTML = "";
  for (const item of missing) {
    const row = document.createElement("div");
    row.className = "validation-item error";
    row.textContent = `Missing: ${item}`;
    jiraValidationList.appendChild(row);
  }
}

function isSelectedSubtask() {
  return Boolean(selectedIssueTypeMetadata()?.subtask);
}

function updateParentIssueVisibility() {
  if (!parentIssueField) return;
  const isSubtask = isSelectedSubtask();
  parentIssueField.classList.toggle("required-field", isSubtask);
  fields.parentIssue.placeholder = isSubtask ? "Required, e.g. AUTOTEST-2027" : "Optional for sub-tasks";
}

function renderDynamicRequiredFields() {
  dynamicJiraFields.innerHTML = "";
  const fieldsToRender = selectedExtraRequiredFields();
  for (const field of fieldsToRender) {
    const wrapper = document.createElement("div");
    wrapper.className = "field required-field";
    const label = document.createElement("label");
    label.textContent = field.name;
    label.setAttribute("for", `jira-field-${field.id}`);
    wrapper.appendChild(label);

    const previousValue = state.dynamicFieldValues[field.id] || "";
    const input = field.allowedValues?.length ? document.createElement("select") : document.createElement("input");
    input.id = `jira-field-${field.id}`;
    input.dataset.jiraFieldId = field.id;

    if (field.allowedValues?.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Select...";
      input.appendChild(empty);
      for (const optionValue of field.allowedValues) {
        const option = document.createElement("option");
        option.value = optionValue.id || optionValue.value || optionValue.name || optionValue.key;
        option.textContent = optionValue.name || optionValue.value || optionValue.key || optionValue.id;
        input.appendChild(option);
      }
    } else {
      input.placeholder = field.schema?.type === "array" ? "Comma-separated values" : field.name;
    }

    input.value = previousValue;
    input.addEventListener("input", () => {
      state.dynamicFieldValues[field.id] = input.value;
      renderJiraPreview();
    });
    input.addEventListener("change", () => {
      state.dynamicFieldValues[field.id] = input.value;
      renderJiraPreview();
      saveJiraDefaults();
    });
    wrapper.appendChild(input);
    dynamicJiraFields.appendChild(wrapper);
  }
}

async function refreshJiraStatus() {
  try {
    const response = await jiraFetch("/auth/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check Jira connection.");
    state.jiraConnection = {
      connected: Boolean(data.connected),
      authMode: data.authMode || null,
      sites: data.sites || []
    };
    updateConnectJiraButton();
    if (!data.connected) {
      setJiraStatus("Jira is not connected yet.");
      return state.jiraConnection;
    }
    if (!fields.jiraSite.value && data.sites?.[0]?.url) fields.jiraSite.value = data.sites[0].url;
    const siteText = data.sites?.length ? ` Connected sites: ${data.sites.map(site => site.name || site.url).join(", ")}.` : "";
    setJiraSuccess(`Jira connected.${siteText}`);
    return state.jiraConnection;
  } catch (error) {
    state.jiraConnection = {
      connected: false,
      authMode: null,
      sites: []
    };
    updateConnectJiraButton();
    setJiraStatus("Local Jira connector is not running.");
    return null;
  }
}

function startJiraConnectionPolling() {
  if (jiraConnectionPollId) clearInterval(jiraConnectionPollId);
  let attempts = 0;
  jiraConnectionPollId = setInterval(async () => {
    attempts += 1;
    const connection = await refreshJiraStatus();
    if (connection?.connected || attempts >= 30) {
      clearInterval(jiraConnectionPollId);
      jiraConnectionPollId = null;
    }
  }, 2000);
}

async function loadJiraProjectFields() {
  const projectKey = fields.project.value.trim();
  if (!projectKey) {
    setJiraStatus("Enter a Jira project key first.");
    return;
  }

  setJiraStatus(`Loading Jira fields for ${projectKey}...`);
  const params = new URLSearchParams({
    projectKey,
    site: fields.jiraSite.value
  });
  const response = await jiraFetch(`/jira/project-meta?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setJiraStatus(data.error || "Could not load Jira project fields.");
    return;
  }

  state.jiraIssueTypes = focusedIssueTypes(data.issueTypes || []);
  const issueTypeNames = state.jiraIssueTypes.map(issueType => issueType.name);
  replaceSelectOptions(fields.issueType, issueTypeNames, fields.issueType.value || "Task");
  updatePriorityOptionsForIssueType();

  const requiredFields = state.jiraIssueTypes.find(issueType => issueType.name === fields.issueType.value)?.requiredFields || [];
  const extraRequired = requiredFields
    .filter(field => !standardJiraFieldIds.has(field.id))
    .filter(field => field.name !== "Work instructions" && field.name !== "Description")
    .map(field => field.name);
  const requiredText = extraRequired.length ? ` Required fields may still be needed: ${extraRequired.join(", ")}.` : "";
  setJiraStatus(`Loaded ${issueTypeNames.length} QA issue types for ${data.key}.${requiredText}`);
  updateParentIssueVisibility();
  renderDynamicRequiredFields();
  renderJiraPreview();
  saveJiraDefaults();
}

async function autoLoadSavedProjectFields() {
  if (!fields.project.value.trim()) return;
  await loadJiraProjectFields();
}

async function searchJiraProjects() {
  const query = fields.project.value.trim();
  const params = new URLSearchParams({
    q: query,
    site: fields.jiraSite.value
  });
  const response = await jiraFetch(`/jira/projects?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setJiraStatus(data.error || "Could not search Jira projects.");
    return;
  }
  setDatalistOptions(
    projectOptions,
    data.projects || [],
    project => project.key,
    project => `${project.name} (${project.key})`
  );
}

async function searchParentIssues() {
  const projectKey = fields.project.value.trim();
  if (!projectKey) return;
  const query = fields.parentIssue.value.trim();
  const params = new URLSearchParams({
    projectKey,
    q: query,
    site: fields.jiraSite.value
  });
  const response = await jiraFetch(`/jira/issues?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setJiraStatus(data.error || "Could not search parent issues.");
    return;
  }
  setDatalistOptions(
    parentIssueOptions,
    data.issues || [],
    issue => issue.key,
    issue => [issue.summary, [issue.issueType, issue.status].filter(Boolean).join(", ")].filter(Boolean).join(" ")
  );
}

async function searchAssignableUsers() {
  const projectKey = fields.project.value.trim();
  if (!projectKey) return;
  const query = fields.assignee.value.trim();
  const params = new URLSearchParams({
    projectKey,
    q: query,
    site: fields.jiraSite.value
  });
  const response = await jiraFetch(`/jira/assignable-users?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    setJiraStatus(data.error || "Could not search assignees.");
    return;
  }
  state.assignableUsers = data.users || [];
  setDatalistOptions(
    assigneeOptions,
    state.assignableUsers,
    user => assigneeDisplayName(user),
    user => user.emailAddress || ""
  );
}

function updatePriorityOptionsForIssueType() {
  const issueType = selectedIssueTypeMetadata();
  const priorities = issueType?.priorities?.map(priority => priority.name) || [];
  if (priorities.length) replaceSelectOptions(fields.priority, priorities, fields.priority.value);
  updateParentIssueVisibility();
  renderDynamicRequiredFields();
  renderJiraPreview();
  saveJiraDefaults();
}

async function loadJiraDefaults() {
  const { jiraDefaults = {} } = await chrome.storage.local.get("jiraDefaults");
  if (jiraDefaults.backendUrl) fields.backendUrl.value = jiraDefaults.backendUrl;
  if (jiraDefaults.jiraSite) fields.jiraSite.value = jiraDefaults.jiraSite;
  if (jiraDefaults.project) fields.project.value = jiraDefaults.project;
  if (jiraDefaults.parentIssue) fields.parentIssue.value = jiraDefaults.parentIssue;
  if (jiraDefaults.issueType) replaceSelectOptions(fields.issueType, [jiraDefaults.issueType], jiraDefaults.issueType);
  if (jiraDefaults.priority) fields.priority.value = jiraDefaults.priority;
  state.dynamicFieldValues = jiraDefaults.dynamicFieldValues || {};
}

function saveJiraDefaults() {
  chrome.storage.local.set({
    jiraDefaults: {
      backendUrl: fields.backendUrl.value,
      jiraSite: fields.jiraSite.value,
      project: fields.project.value,
      issueType: fields.issueType.value,
      parentIssue: fields.parentIssue.value,
      priority: fields.priority.value,
      dynamicFieldValues: state.dynamicFieldValues
    }
  });
}

async function connectJira() {
  setJiraStatus("Checking Jira connection...");
  const connection = await refreshJiraStatus();
  if (!connection) return;
  if (connection.connected) {
    setJiraSuccess("Jira is already connected.");
    return;
  }
  if (connection.authMode === "apiToken") {
    setJiraError("Connector is running, but Jira is not ready. Check the API token config.");
    return;
  }
  setJiraStatus("Opening Atlassian sign-in...");
  await chrome.tabs.create({ url: await jiraAuthStartUrl() });
  startJiraConnectionPolling();
}

async function createJiraIssue() {
  hideCreatedIssue();
  renderJiraPreview();
  const missing = validateJiraDraft();
  if (missing.length) {
    setJiraError(`Complete required Jira fields: ${missing.join(", ")}.`);
    return;
  }
  const payload = buildJiraPayload();

  setJiraStatus("Creating Jira issue...");
  const response = await jiraFetch("/jira/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    setJiraError(formatJiraCreateError(data));
    return;
  }
  setJiraSuccess(`Created ${data.key}.`);
  showCreatedIssue(data);
  showToast(`Created ${data.key}`);
  saveJiraDefaults();
}

function exportPng() {
  const link = document.createElement("a");
  link.download = `qa-capture-${Date.now()}.png`;
  link.href = annotatedPngDataUrl();
  link.click();
}

function updateZoom() {
  const width = state.imageWidth || imageCanvas.width;
  const height = state.imageHeight || imageCanvas.height;
  stage.style.width = `${Math.round(width * state.zoom)}px`;
  stage.style.height = `${Math.round(height * state.zoom)}px`;
  document.getElementById("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
}

async function loadCapture(options = {}) {
  const { latestCapture } = await chrome.storage.session.get("latestCapture");
  if (!latestCapture?.screenshot) {
    imageMeta.textContent = "No capture loaded";
    renderIssues();
    renderJiraPreview();
    return;
  }
  if (options.resetAnnotations) clearAnnotationState();

  const context = latestCapture.context || {};
  fields.url.value = context.url || "";
  fields.title.value = context.title || "";
  fields.browser.value = browserLabel(context.userAgent || navigator.userAgent);
  fields.viewport.value = context.viewport || `${window.innerWidth} x ${window.innerHeight}`;
  state.devicePixelRatio = context.devicePixelRatio || window.devicePixelRatio || "";
  state.screenSize = context.screen || "";
  document.getElementById("captureSubtitle").textContent = context.url || "Captured tab";
  setImageFromSource(latestCapture.screenshot, "tab-capture.png");
  renderIssues();
  renderJiraPreview();
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    drawCanvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
    document.querySelectorAll(".tool").forEach(el => el.classList.remove("active"));
    button.classList.add("active");
  });
});

const swatches = document.getElementById("swatches");
colors.forEach(color => {
  const button = document.createElement("button");
  button.className = "swatch";
  button.style.background = color;
  button.title = color;
  button.addEventListener("click", () => {
    state.color = color;
    document.querySelectorAll(".swatch").forEach(el => el.classList.remove("active"));
    button.classList.add("active");
  });
  swatches.appendChild(button);
});
swatches.firstElementChild.classList.add("active");

drawCanvas.addEventListener("pointerdown", event => {
  if (!state.screenshot) return;
  const point = getPoint(event);
  if (state.tool === "select") {
    const selected = state.annotations[state.selectedAnnotationIndex];
    const handle = resizeHandleAt(point, selected);
    if (handle) {
      state.resizingAnnotation = { index: state.selectedAnnotationIndex, handle };
      drawCanvas.setPointerCapture(event.pointerId);
      return;
    }
    selectAnnotationAt(point);
    if (state.selectedAnnotationIndex != null) {
      state.draggingAnnotation = { index: state.selectedAnnotationIndex, last: point };
      drawCanvas.setPointerCapture(event.pointerId);
    }
    return;
  }
  state.selectedAnnotationIndex = null;
  if (state.tool === "pin") {
    state.annotations.push({ tool: "pin", color: state.color, x: point.x, y: point.y });
    renderAnnotations();
    return;
  }
  if (state.tool === "text") {
    const text = prompt("Text callout");
    if (!text?.trim()) return;
    state.annotations.push({ tool: "text", color: state.color, x: point.x, y: point.y, text: text.trim() });
    renderAnnotations();
    return;
  }
  state.drawing = { tool: state.tool, color: state.color, start: point, points: [point] };
  drawCanvas.setPointerCapture(event.pointerId);
});

drawCanvas.addEventListener("pointermove", event => {
  const point = getPoint(event);
  if (state.resizingAnnotation) {
    resizeRectAnnotation(
      state.annotations[state.resizingAnnotation.index],
      state.resizingAnnotation.handle,
      point
    );
    renderAnnotations();
    return;
  }
  if (state.draggingAnnotation) {
    const dx = point.x - state.draggingAnnotation.last.x;
    const dy = point.y - state.draggingAnnotation.last.y;
    moveAnnotation(state.annotations[state.draggingAnnotation.index], dx, dy);
    state.draggingAnnotation.last = point;
    renderAnnotations();
    return;
  }
  if (!state.drawing) {
    updateCanvasCursor(point);
    return;
  }
  const draft = state.drawing;
  renderAnnotations();
  if (draft.tool === "rect") drawAnnotation(drawCtx, { tool: "rect", color: draft.color, x: draft.start.x, y: draft.start.y, w: point.x - draft.start.x, h: point.y - draft.start.y }, state.annotations.length);
  if (draft.tool === "arrow") drawAnnotation(drawCtx, { tool: "arrow", color: draft.color, x: draft.start.x, y: draft.start.y, x2: point.x, y2: point.y }, state.annotations.length);
  if (draft.tool === "pen" || draft.tool === "highlight") {
    draft.points.push(point);
    drawAnnotation(drawCtx, { tool: draft.tool, color: draft.color, points: draft.points }, state.annotations.length);
  }
});

drawCanvas.addEventListener("pointerup", event => {
  if (state.resizingAnnotation) {
    state.resizingAnnotation = null;
    return;
  }
  if (state.draggingAnnotation) {
    state.draggingAnnotation = null;
    return;
  }
  if (!state.drawing) return;
  const point = getPoint(event);
  const draft = state.drawing;
  if (draft.tool === "rect") state.annotations.push({ tool: "rect", color: draft.color, x: draft.start.x, y: draft.start.y, w: point.x - draft.start.x, h: point.y - draft.start.y });
  if (draft.tool === "arrow") state.annotations.push({ tool: "arrow", color: draft.color, x: draft.start.x, y: draft.start.y, x2: point.x, y2: point.y });
  if (draft.tool === "pen" || draft.tool === "highlight") state.annotations.push({ tool: draft.tool, color: draft.color, points: draft.points });
  state.drawing = null;
  renderAnnotations();
});

drawCanvas.addEventListener("dblclick", event => {
  if (state.tool !== "select") return;
  editTextAnnotationAt(getPoint(event));
});

document.getElementById("recaptureBtn").addEventListener("click", async () => {
  setJiraStatus("Recapturing source tab...");
  const response = await chrome.runtime.sendMessage({ type: "QA_RECAPTURE_SOURCE" });
  if (!response?.ok) {
    showToast(response?.error || "Capture failed");
    return;
  }
  const archived = archiveCurrentScreenshotAttachment();
  await loadCapture({ resetAnnotations: true });
  showToast(archived ? "Previous markup saved, source tab recaptured" : "Source tab recaptured");
  setJiraStatus(archived ? `${archived.filename} added as an attachment.` : "Source tab recaptured.");
});
document.getElementById("addIssueBtn").addEventListener("click", addIssue);
document.querySelectorAll("[data-editor-command]").forEach(button => {
  button.addEventListener("click", () => {
    descriptionEditor.focus();
    document.execCommand(button.dataset.editorCommand, false, null);
    syncDescriptionField();
    renderJiraPreview();
  });
});
descriptionEditor.addEventListener("input", () => {
  syncDescriptionField();
  renderJiraPreview();
});
document.getElementById("undoBtn").addEventListener("click", () => {
  state.annotations.pop();
  state.selectedAnnotationIndex = null;
  renderAnnotations();
});
document.getElementById("deleteSelectedBtn").addEventListener("click", deleteSelectedAnnotation);
document.getElementById("clearBtn").addEventListener("click", () => {
  state.annotations = [];
  state.selectedAnnotationIndex = null;
  renderAnnotations();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  deleteSelectedAnnotation();
});
document.getElementById("exportPngBtn").addEventListener("click", exportPng);
connectJiraBtn.addEventListener("click", connectJira);
document.getElementById("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("createJiraIssueBtn").addEventListener("click", () => createJiraIssue().catch(error => setJiraStatus(error.message)));
fields.project.addEventListener("change", () => {
  saveJiraDefaults();
  loadJiraProjectFields().catch(error => setJiraStatus(error.message));
  searchParentIssues().catch(error => setJiraStatus(error.message));
  searchAssignableUsers().catch(error => setJiraStatus(error.message));
  renderJiraPreview();
});
fields.issueType.addEventListener("change", updatePriorityOptionsForIssueType);
fields.project.addEventListener("input", debounce(() => searchJiraProjects().catch(error => setJiraStatus(error.message))));
fields.parentIssue.addEventListener("input", debounce(() => searchParentIssues().catch(error => setJiraStatus(error.message))));
fields.parentIssue.addEventListener("focus", () => searchParentIssues().catch(error => setJiraStatus(error.message)));
fields.assignee.addEventListener("input", debounce(() => {
  renderJiraPreview();
  searchAssignableUsers().catch(error => setJiraStatus(error.message));
}));
fields.assignee.addEventListener("change", () => {
  renderJiraPreview();
});
fields.assignee.addEventListener("focus", () => searchAssignableUsers().catch(error => setJiraStatus(error.message)));
openCreatedIssueBtn.addEventListener("click", () => {
  const url = openCreatedIssueBtn.dataset.url;
  if (url) chrome.tabs.create({ url });
});
copyCreatedIssueKeyBtn.addEventListener("click", async () => {
  const key = copyCreatedIssueKeyBtn.dataset.key;
  if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    showToast(`Copied ${key}`);
  } catch (error) {
    setJiraError(`Could not copy ${key}.`);
  }
});
clearIssuesBtn.addEventListener("click", clearCurrentIssues);
fields.extraAttachment.addEventListener("change", () => {
  addExtraAttachments(fields.extraAttachment.files).catch(error => setJiraError(error.message));
});
for (const field of [fields.backendUrl, fields.jiraSite, fields.project, fields.parentIssue, fields.priority]) {
  field.addEventListener("change", () => {
    renderJiraPreview();
    saveJiraDefaults();
  });
}
for (const field of [fields.summary, fields.jiraSite, fields.project, fields.parentIssue, fields.priority]) {
  field.addEventListener("input", renderJiraPreview);
}
document.getElementById("zoomOutBtn").addEventListener("click", () => {
  state.zoom = Math.max(.35, state.zoom - .1);
  updateZoom();
});
document.getElementById("zoomInBtn").addEventListener("click", () => {
  state.zoom = Math.min(1.8, state.zoom + .1);
  updateZoom();
});
window.addEventListener("focus", () => {
  refreshJiraStatus().catch(error => setJiraStatus(error.message));
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshJiraStatus().catch(error => setJiraStatus(error.message));
});

loadJiraDefaults()
  .then(() => Promise.all([loadCapture(), refreshJiraStatus(), searchJiraProjects()]))
  .then(() => autoLoadSavedProjectFields())
  .catch(error => setJiraStatus(error.message));
