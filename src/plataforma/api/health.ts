import { Router } from "express";
import { Health } from "../../shared/contrato.js";
import { motor } from "../motor.js";
import { estaOffline } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    const estadoMotor = await motor.estado();
    const health = Health.parse({
      ollama: estadoMotor.ollama,
      gitleaks: estadoMotor.gitleaks,
      offline: estaOffline(),
    });
    res.json(health);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `No se pudo consultar el estado del motor: ${mensaje}` });
  }
});
