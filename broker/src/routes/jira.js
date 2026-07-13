import { Router } from "express";

export function createJiraRouter({ jiraClient }) {
  const router = Router();

  router.get("/project-meta", async (req, res, next) => {
    try {
      res.json(await jiraClient.getProjectCreateMetadata(req));
    } catch (error) {
      next(error);
    }
  });

  router.get("/projects", async (req, res, next) => {
    try {
      res.json(await jiraClient.searchProjects(req));
    } catch (error) {
      next(error);
    }
  });

  router.get("/issues", async (req, res, next) => {
    try {
      res.json(await jiraClient.searchIssues(req));
    } catch (error) {
      next(error);
    }
  });

  router.get("/assignable-users", async (req, res, next) => {
    try {
      res.json(await jiraClient.searchAssignableUsers(req));
    } catch (error) {
      next(error);
    }
  });

  router.post("/create", async (req, res, next) => {
    try {
      res.json(await jiraClient.createIssue(req));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
