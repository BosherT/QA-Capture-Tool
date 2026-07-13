# QA Capture Hosted Broker

This is the first hosted-service scaffold for replacing the local Jira connector. It keeps the same route shape as the local connector, but is structured for deployment and database-backed token storage.

The local connector in `../qa-capture-jira-backend` remains the working prototype. This folder is the migration path toward removing the need to run Node on every QA user's machine.

## Current Scope

Implemented:

- `GET /`
- `GET /health`
- `POST /auth/session`
- `GET /auth/start`
- `GET /auth/callback`
- `GET /auth/status`
- `POST /auth/disconnect`
- `POST /jira/create`
- `GET /jira/project-meta`
- `GET /jira/projects`
- `GET /jira/issues`
- `GET /jira/assignable-users`

Production hardening still needed:

- Production CORS/session hardening

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill in the Atlassian OAuth values.
3. Install dependencies if you have not already:

   ```powershell
   npm.cmd install
   ```

4. Generate a token encryption key:

   ```powershell
   npm.cmd run token-key:generate
   ```

   Copy the output into `.env` as `TOKEN_ENCRYPTION_KEY`.

5. Start Postgres:

   ```powershell
   docker compose up -d
   ```

6. Run the database migration:

   ```powershell
   npm.cmd run db:migrate
   ```

7. Check database mode:

   ```powershell
   npm.cmd run db:status
   ```

   You should see `Database mode: Postgres`.

8. Use this callback URL in the Atlassian Developer Console while testing locally:

   `http://127.0.0.1:8788/auth/callback`

9. Start the broker:

   ```powershell
   npm.cmd start
   ```

10. Open:

   `http://127.0.0.1:8788`

The dashboard and `/health` response show whether tokens are using `postgres` or the memory fallback.
In Postgres mode, OAuth access and refresh tokens are encrypted before being stored.

The browser extension uses `POST /auth/session` to get an opaque broker session token, stores it in extension storage, and sends it on API calls as `X-QA-Capture-Session`. This links extension requests to the correct Jira OAuth connection.

## Persistence Test

1. Connect Jira through `http://127.0.0.1:8788`.
2. Confirm `http://127.0.0.1:8788/auth/status` says `connected: true`.
3. Stop the broker with `Ctrl+C`.
4. Start it again with `npm.cmd start`.
5. Open `http://127.0.0.1:8788/auth/status` again.

If Postgres is configured, it should still say `connected: true`.

## Encrypt Existing Local Tokens

If you connected Jira before token encryption was added, run:

```powershell
npm.cmd run tokens:reencrypt
```

This converts existing active token rows from plain text to encrypted values.

## Next Phase

The next implementation step is choosing a deployment target and replacing local URLs with the hosted broker URL.

Deployment notes:

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md)
