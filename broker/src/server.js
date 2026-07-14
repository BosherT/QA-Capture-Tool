import express from "express";
import { getConfig } from "./config.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createJiraRouter } from "./routes/jira.js";
import { createAtlassianOAuthService } from "./services/atlassianOAuth.js";
import { createJiraClient } from "./services/jiraClient.js";
import { createTokenStore } from "./services/tokenStore.js";

const config = getConfig();
const app = express();
const tokenStore = createTokenStore(config);
const oauth = createAtlassianOAuthService(config, tokenStore);
const jiraClient = createJiraClient(config, oauth, tokenStore);

app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowOrigin = config.corsOrigin === "*" || config.corsOrigin.includes("your-extension-id")
    ? requestOrigin || "*"
    : config.corsOrigin;
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-QA-Capture-Session");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pinpoint Hosted Broker</title>
</head>
<body>
  <main>
    <h1>Pinpoint Hosted Broker</h1>
    <p>Broker is running at <code>${config.publicBaseUrl}</code>.</p>
    <p>Token store: <code>${tokenStore.mode}</code></p>
    <p><a href="/health">Health</a> | <a href="/auth/status">Auth status</a> | <a href="/auth/start">Connect Jira</a></p>
  </main>
</body>
</html>`);
});

app.use("/health", createHealthRouter({ config, tokenStore }));
app.use("/auth", createAuthRouter({ config, oauth, tokenStore }));
app.use("/jira", createJiraRouter({ jiraClient }));

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    error: error.message || "Unexpected broker error.",
    details: error.details || null
  });
});

app.listen(config.port, () => {
  console.log("");
  console.log("Pinpoint Hosted Broker is running.");
  console.log(`URL: ${config.publicBaseUrl}`);
  console.log(`Callback: ${config.atlassian.redirectUri}`);
  console.log(`Token store: ${tokenStore.mode}`);
  console.log("Press Ctrl+C to stop.");
  console.log("");
});
