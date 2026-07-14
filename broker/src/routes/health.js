import { Router } from "express";

export function createHealthRouter({ config, tokenStore }) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json({
      ok: true,
      service: "pinpoint-hosted-broker",
      version: "0.1.0",
      publicBaseUrl: config.publicBaseUrl,
      tokenStore: tokenStore.mode
    });
  });

  return router;
}
