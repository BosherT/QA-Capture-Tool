# Pinpoint

Pinpoint is a browser extension and Jira Cloud broker for logging QA issues from the page being tested. It lets a tester capture the visible viewport, annotate the screenshot, add a description, and create a Jira issue with the marked-up screenshots attached.

The project is intended to replace an unsupported paid screenshot-to-Jira browser extension with an internally controlled workflow.

## What Is Included

- `extension/` - Chrome/Edge extension shell for capturing, annotating, and creating Jira issues.
- `broker/` - Node.js hosted broker that handles Atlassian OAuth and Jira Cloud API calls.
- `HOSTED_ARCHITECTURE.md` - high-level architecture notes for moving away from local-only tooling.
- `docs/` - setup, deployment, and update workflow notes.

## Current Status

Implemented:

- Viewport screenshot capture.
- Annotation tools for boxes, pins, arrows, freehand drawing, highlights, text callouts, selection, resizing, undo, and clearing annotations.
- Multi-screenshot Jira issue workflow.
- Jira Cloud issue creation through a broker.
- Atlassian OAuth support.
- PostgreSQL-backed OAuth token storage.
- Token encryption at rest.
- Extension session tokens so browser extension requests map to the correct Jira connection.

Next focus:

- Prepare the hosted broker for Azure App Service.
- Confirm production environment variables and callback URLs.
- Package the extension with the final hosted broker URL.

## Local Setup

See [Local Development](docs/LOCAL_DEVELOPMENT.md).

## Deployment Prep

See [Azure App Service Prep](docs/AZURE_APP_SERVICE_PREP.md) and [broker/DEPLOYMENT.md](broker/DEPLOYMENT.md).

## Updating The Project

See [Update Workflow](docs/UPDATE_WORKFLOW.md).

## Secret Safety

Do not commit local secrets or generated token files. The repo intentionally ignores:

- `.env`
- `.env.*`
- `node_modules/`
- `oauth-tokens.json`
- `config.json`
- log files
