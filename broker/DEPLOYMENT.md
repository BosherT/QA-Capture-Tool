# Hosted Broker Deployment Checklist

This is the provider-neutral deployment checklist for the Pinpoint Hosted Broker. It is intentionally generic so the broker can move between Azure, Render, Railway, internal infrastructure, or another container host without code changes.

## Required Runtime

- Node.js 20 or newer, or a container runtime using the provided `Dockerfile`
- HTTPS public URL
- Hosted Postgres database
- Environment variables / secret storage
- Outbound HTTPS access to Atlassian

## Required Environment Variables

```text
PORT=8788
PUBLIC_BASE_URL=https://your-broker-domain
ATLASSIAN_CLIENT_ID=...
ATLASSIAN_CLIENT_SECRET=...
ATLASSIAN_REDIRECT_URI=https://your-broker-domain/auth/callback
ATLASSIAN_SCOPES=read:jira-work write:jira-work read:jira-user offline_access
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=...
SESSION_COOKIE_NAME=qa_capture_session
SESSION_COOKIE_SECURE=true
CORS_ORIGIN=chrome-extension://your-real-extension-id
```

Generate `TOKEN_ENCRYPTION_KEY` with:

```powershell
npm.cmd run token-key:generate
```

Do not reuse local development secrets in production.

## Deployment Steps

1. Create or choose a hosted Postgres database.
2. Deploy the broker as a Node app or container.
3. Configure all required environment variables.
4. Run the database migration:

   ```text
   npm run db:migrate
   ```

5. Confirm health:

   ```text
   https://your-broker-domain/health
   ```

6. Add the production callback URL to the Atlassian OAuth app:

   ```text
   https://your-broker-domain/auth/callback
   ```

7. Update the extension Connector URL default or setting:

   ```text
   https://your-broker-domain
   ```

8. Test from the extension:
   - Connect Jira
   - Confirm status becomes connected
   - Create a test Jira issue
   - Restart the broker
   - Confirm status remains connected

## Rollback

The deployment packaging is isolated to this hosted-broker folder. If the hosting target changes, keep the application code and replace only provider-specific configuration/docs.

For a production rollback:

1. Point the extension Connector URL back to the previous broker URL.
2. Restore the previous deployed broker version.
3. Keep the Postgres database intact unless you explicitly intend to remove stored OAuth connections.

## Security Notes

- Tokens are encrypted at rest using `TOKEN_ENCRYPTION_KEY`.
- Store `TOKEN_ENCRYPTION_KEY`, Atlassian client secret, and `DATABASE_URL` in the hosting provider's secret manager/app settings.
- Set `SESSION_COOKIE_SECURE=true` for HTTPS production deployments.
- Set `CORS_ORIGIN` to the real Chrome extension origin once the extension ID is known.
- Do not expose `.env`, database credentials, or token values in logs.
