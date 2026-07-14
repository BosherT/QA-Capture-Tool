import { Router } from "express";
import { randomBytes } from "crypto";
import { assertOAuthConfigured } from "../config.js";

const stateStore = new Map();

function createSessionId() {
  return randomBytes(24).toString("hex");
}

function setSessionCookie(res, config, sessionId) {
  const secure = config.sessionCookieSecure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${config.sessionCookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function clearSessionCookie(res, config) {
  res.setHeader("Set-Cookie", `${config.sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

export function createAuthRouter({ config, oauth, tokenStore }) {
  const router = Router();

  router.post("/session", (req, res) => {
    const sessionId = createSessionId();
    setSessionCookie(res, config, sessionId);
    res.json({ session: sessionId });
  });

  router.get("/start", (req, res, next) => {
    try {
      assertOAuthConfigured(config);
      const sessionId = sessionIdFromRequest(req, config) || createSessionId();
      const state = randomBytes(24).toString("hex");
      stateStore.set(state, { sessionId, createdAt: Date.now() });
      setSessionCookie(res, config, sessionId);
      res.redirect(oauth.authorizationUrl(state));
    } catch (error) {
      next(error);
    }
  });

  router.get("/callback", async (req, res, next) => {
    try {
      const { code, state } = req.query;
      const storedState = stateStore.get(state);
      if (!code || !storedState) {
        return res.status(400).type("html").send("<h1>Jira connection failed</h1><p>Invalid OAuth callback.</p>");
      }

      stateStore.delete(state);
      setSessionCookie(res, config, storedState.sessionId);
      const tokenSet = await oauth.exchangeCodeForToken(code);
      const sites = await oauth.fetchAccessibleResources(tokenSet.access_token);
      await tokenStore.saveTokenSet(storedState.sessionId, tokenSet, sites);

      res.type("html").send("<h1>Jira connected</h1><p>You can close this tab and return to Pinpoint.</p>");
    } catch (error) {
      next(error);
    }
  });

  router.get("/status", async (req, res, next) => {
    try {
      const sessionId = sessionIdFromRequest(req, config);
      if (!sessionId) return res.json({ connected: false, authMode: "oauth", sites: [] });
      const connection = await oauth.ensureConnection(sessionId);
      res.json({
        connected: Boolean(connection),
        authMode: "oauth",
        sites: connection?.sites || []
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/disconnect", async (req, res, next) => {
    try {
      const sessionId = sessionIdFromRequest(req, config);
      if (sessionId) await tokenStore.deleteTokenSet(sessionId);
      clearSessionCookie(res, config);
      res.json({ disconnected: true, authMode: "oauth" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
