export function createJiraClient(config, oauth, tokenStore) {
  async function requireConnection(req) {
    const sessionId = sessionIdFromRequest(req, config);
    if (!sessionId) throw httpError("Jira is not connected.", 401);
    const connection = await oauth.ensureConnection(sessionId);
    if (!connection) throw httpError("Jira is not connected.", 401);
    return connection;
  }

  async function jiraFetch(req, path, options = {}) {
    const connection = await requireConnection(req);
    const site = selectSite(connection.sites, req.query.site || req.body?.site);
    const body = await jiraFetchForSite(connection, site, path, options);
    return { body, site, connection };
  }

  async function jiraFetchForSite(connection, site, path, options = {}) {
    const response = await fetch(`https://api.atlassian.com/ex/jira/${site.id}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${connection.tokenSet.access_token}`,
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = httpError(formatJiraError(response.status, body), response.status);
      error.details = body;
      throw error;
    }
    return body;
  }

  async function getIssueTypeCreateFields(req, connection, site, projectKey, issueTypeName) {
    const metadata = await jiraFetchForSite(
      connection,
      site,
      `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`
    );
    const project = metadata.projects?.[0];
    const issueType = project?.issuetypes?.find(candidate => candidate.name === issueTypeName);
    return issueType?.fields || {};
  }

  async function mapDescriptionFieldForCreate(req, connection, site, request) {
    const description = request.fields.description;
    if (!description) return request;

    const projectKey = request.fields.project?.key;
    const issueTypeName = request.fields.issuetype?.name;
    if (!projectKey || !issueTypeName) return request;

    const createFields = await getIssueTypeCreateFields(req, connection, site, projectKey, issueTypeName);
    const instructionField = findTextInstructionField(createFields);
    const fields = { ...request.fields };
    delete fields.description;

    if (instructionField) {
      const [fieldId, field] = instructionField;
      fields[fieldId] = formatInstructionValue(fieldId, field, description);
    }

    return { ...request, fields };
  }

  async function createJiraIssueWithFallback(connection, site, request) {
    try {
      const issue = await jiraFetchForSite(connection, site, "/rest/api/3/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      return { issue, removedFields: [] };
    } catch (error) {
      if (!shouldRetryWithoutOptionalFields(error)) throw error;
      const fallback = removeRejectedFields(request, error);
      const fallbackRequest = fallback.removedFields.length ? fallback.request : optionalFieldsFallback(request);
      const removedFields = fallback.removedFields.length ? fallback.removedFields : ["priority", "labels"];
      const issue = await jiraFetchForSite(connection, site, "/rest/api/3/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackRequest)
      });
      return { issue, removedFields };
    }
  }

  return {
    async getProjectCreateMetadata(req) {
      const projectKey = req.query.projectKey;
      if (!projectKey) throw httpError("projectKey is required.", 400);

      const { body: metadata } = await jiraFetch(
        req,
        `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`
      );
      const project = metadata.projects?.[0];
      if (!project) throw httpError(`No Jira create metadata found for project ${projectKey}.`, 404);

      return {
        key: project.key,
        name: project.name,
        issueTypes: (project.issuetypes || []).map(issueType => ({
          id: issueType.id,
          name: issueType.name,
          subtask: Boolean(issueType.subtask),
          description: issueType.description || "",
          priorities: issueType.fields?.priority?.allowedValues?.map(priority => ({
            id: priority.id,
            name: priority.name
          })) || [],
          requiredFields: Object.entries(issueType.fields || {})
            .filter(([, field]) => field.required)
            .map(([id, field]) => ({
              id,
              name: field.name,
              schema: field.schema || {},
              allowedValues: (field.allowedValues || []).map(value => ({
                id: value.id,
                key: value.key,
                name: value.name || value.value || value.key || value.id,
                value: value.value
              }))
            }))
        }))
      };
    },

    async searchProjects(req) {
      const q = req.query.q || "";
      const params = new URLSearchParams({ maxResults: "12" });
      if (q) params.set("query", q);

      const { body: result } = await jiraFetch(req, `/rest/api/3/project/search?${params.toString()}`);
      return {
        projects: (result.values || []).map(project => ({
          id: project.id,
          key: project.key,
          name: project.name,
          style: project.style,
          simplified: Boolean(project.simplified)
        }))
      };
    },

    async searchIssues(req) {
      const projectKey = req.query.projectKey;
      if (!projectKey) throw httpError("projectKey is required.", 400);
      const params = new URLSearchParams({
        query: req.query.q || "",
        currentJQL: `project = "${escapeJqlString(projectKey)}" ORDER BY updated DESC`,
        showSubTasks: "false",
        showSubTaskParent: "false"
      });

      const { body: result } = await jiraFetch(req, `/rest/api/3/issue/picker?${params.toString()}`);
      const issues = (result.sections || []).flatMap(section => section.issues || []);
      return {
        issues: issues.slice(0, 12).map(issue => ({
          id: String(issue.id || ""),
          key: issue.key,
          summary: issue.summaryText || issue.summary || "",
          issueType: "",
          status: ""
        }))
      };
    },

    async searchAssignableUsers(req) {
      const projectKey = req.query.projectKey;
      if (!projectKey) throw httpError("projectKey is required.", 400);
      const params = new URLSearchParams({
        project: projectKey,
        query: req.query.q || "",
        maxResults: "12"
      });

      const { body: users } = await jiraFetch(req, `/rest/api/3/user/assignable/search?${params.toString()}`);
      return {
        users: (users || []).map(user => ({
          accountId: user.accountId,
          displayName: user.displayName,
          emailAddress: user.emailAddress || "",
          active: user.active !== false
        }))
      };
    },

    async createIssue(req) {
      const payload = req.body || {};
      if (!payload.request?.fields) throw httpError("Jira create payload is missing request.fields.", 400);

      const connection = await requireConnection(req);
      const site = selectSite(connection.sites, payload.site);
      const request = await mapDescriptionFieldForCreate(req, connection, site, payload.request);
      const created = await createJiraIssueWithFallback(connection, site, request);
      const issue = created.issue;

      const attachments = Array.isArray(payload.attachments) && payload.attachments.length
        ? payload.attachments
        : [payload.attachment].filter(Boolean);

      for (const attachment of attachments) {
        if (!attachment?.dataUrl) continue;
        const form = new FormData();
        form.append("file", dataUrlToBlob(attachment.dataUrl), attachment.filename || "pinpoint-attachment");
        await jiraFetchForSite(connection, site, `/rest/api/3/issue/${issue.key}/attachments`, {
          method: "POST",
          headers: { "X-Atlassian-Token": "no-check" },
          body: form
        });
      }

      return {
        key: issue.key,
        id: issue.id,
        url: `${site.url}/browse/${issue.key}`
      };
    }
  };
}

function sessionIdFromRequest(req, config) {
  const headerSession = req.get("X-QA-Capture-Session");
  if (headerSession) return headerSession;
  const querySession = req.query.session;
  if (querySession) return String(querySession);
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(part => part.trim());
  const match = parts.find(part => part.startsWith(`${config.sessionCookieName}=`));
  return match ? decodeURIComponent(match.slice(config.sessionCookieName.length + 1)) : null;
}

function selectSite(sites, siteUrl) {
  if (!sites.length) throw httpError("No Jira sites are available for this connection.", 400);
  const normalized = String(siteUrl || "").replace(/\/$/, "");
  return sites.find(site => String(site.url || "").replace(/\/$/, "") === normalized) || sites[0];
}

function escapeJqlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  if (!header || !data) throw new Error("Attachment data is not a valid data URL.");
  const contentType = header.match(/data:(.*?);base64/)?.[1] || "image/png";
  return new Blob([Buffer.from(data, "base64")], { type: contentType });
}

function findTextInstructionField(fields) {
  const entries = Object.entries(fields);
  return entries.find(([, field]) => field.name === "Work instructions")
    || entries.find(([id, field]) => id === "description" || field.name === "Description");
}

function adfToPlainText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "bulletList") {
    return (node.content || []).map(item => `- ${adfToPlainText(item).trim()}`).join("\n");
  }
  if (node.type === "orderedList") {
    const start = node.attrs?.order || 1;
    return (node.content || []).map((item, index) => `${start + index}. ${adfToPlainText(item).trim()}`).join("\n");
  }
  if (node.type === "listItem") {
    return (node.content || []).map(adfToPlainText).filter(Boolean).join(" ").trim();
  }
  if (Array.isArray(node.content)) {
    const separator = node.type === "paragraph" || node.type === "heading" ? "" : "\n";
    const text = node.content.map(adfToPlainText).filter(Boolean).join(separator);
    return node.type === "paragraph" ? `${text}\n` : text;
  }
  return "";
}

function formatInstructionValue(fieldId, field, description) {
  if (fieldId === "description") return description;
  if (field.name === "Work instructions") return description;
  if (field.schema?.type === "string") return adfToPlainText(description).trim();
  return description;
}

function optionalFieldsFallback(request) {
  const fields = { ...request.fields };
  delete fields.priority;
  delete fields.labels;
  return { ...request, fields };
}

function removeRejectedFields(request, error) {
  const fields = { ...request.fields };
  const rejectedFields = Object.keys(error.details?.errors || {});
  const removable = new Set(["description", "priority", "labels"]);
  const removedFields = [];

  for (const field of rejectedFields) {
    if (!removable.has(field)) continue;
    delete fields[field];
    removedFields.push(field);
  }

  if (removedFields.length === 0) {
    const message = String(error.message || "").toLowerCase();
    for (const field of removable) {
      if (!message.includes(field)) continue;
      delete fields[field];
      removedFields.push(field);
    }
  }

  return {
    request: { ...request, fields },
    removedFields
  };
}

function shouldRetryWithoutOptionalFields(error) {
  const message = String(error.message || "").toLowerCase();
  return error.status === 400
    && (message.includes("priority") || message.includes("labels") || message.includes("cannot be set") || message.includes("field"));
}

function formatJiraError(status, body) {
  const messages = [];
  if (Array.isArray(body?.errorMessages)) messages.push(...body.errorMessages);
  if (body?.message) messages.push(body.message);
  if (body?.errors && typeof body.errors === "object") {
    for (const [field, message] of Object.entries(body.errors)) messages.push(`${field}: ${message}`);
  }
  return messages.length ? messages.join(" ") : `Jira request failed with ${status}.`;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
