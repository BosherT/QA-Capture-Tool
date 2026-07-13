export function createAtlassianOAuthService(config, tokenStore) {
  function authorizationUrl(state) {
    const authUrl = new URL("https://auth.atlassian.com/authorize");
    authUrl.searchParams.set("audience", "api.atlassian.com");
    authUrl.searchParams.set("client_id", config.atlassian.clientId);
    authUrl.searchParams.set("scope", config.atlassian.scopes.join(" "));
    authUrl.searchParams.set("redirect_uri", config.atlassian.redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("prompt", "consent");
    return authUrl.toString();
  }

  async function exchangeCodeForToken(code) {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: config.atlassian.clientId,
        client_secret: config.atlassian.clientSecret,
        code,
        redirect_uri: config.atlassian.redirectUri
      })
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.error_description || body.error || "Token exchange failed.");
    return withExpiry(body);
  }

  async function refreshTokenSet(sessionId, tokenSet) {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: config.atlassian.clientId,
        client_secret: config.atlassian.clientSecret,
        refresh_token: tokenSet.refresh_token
      })
    });

    const body = await response.json();
    if (!response.ok) {
      await tokenStore.deleteTokenSet(sessionId);
      throw new Error(body.error_description || body.error || "Token refresh failed.");
    }

    const nextTokenSet = withExpiry({
      ...body,
      refresh_token: body.refresh_token || tokenSet.refresh_token
    });
    await tokenStore.updateTokenSet(sessionId, nextTokenSet);
    return nextTokenSet;
  }

  async function fetchAccessibleResources(accessToken) {
    const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error_description || body.error || "Could not fetch accessible Jira sites.");
    return body;
  }

  async function ensureConnection(sessionId) {
    const stored = await tokenStore.getTokenSet(sessionId);
    if (!stored) return null;
    let tokenSet = stored.tokenSet;
    if (tokenExpiresSoon(tokenSet)) tokenSet = await refreshTokenSet(sessionId, tokenSet);
    return {
      tokenSet,
      sites: stored.sites || []
    };
  }

  return {
    authorizationUrl,
    exchangeCodeForToken,
    fetchAccessibleResources,
    ensureConnection
  };
}

function withExpiry(tokenSet) {
  return {
    ...tokenSet,
    expires_at: Date.now() + Number(tokenSet.expires_in || 0) * 1000
  };
}

function tokenExpiresSoon(tokenSet) {
  return !tokenSet?.access_token || Number(tokenSet.expires_at || 0) <= Date.now() + 60 * 1000;
}
