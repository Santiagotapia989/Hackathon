import express, { type NextFunction, type Request, type Response } from "express";
import { HOST, PORT, ORIGENES_PERMITIDOS, LIMITES, iniciarDeteccionDeRed } from "./config.js";
import { marcarInterrumpidosPorReinicio } from "./db.js";
import { healthRouter } from "./api/health.js";
import { scansRouter } from "./api/scans.js";
import { agenteRouter } from "./api/agente.js";

marcarInterrumpidosPorReinicio();
iniciarDeteccionDeRed();

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  const origen = req.headers.origin;
  if (origen && ORIGENES_PERMITIDOS.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: LIMITES.bodyJson }));

app.use("/api", healthRouter);
app.use("/api", scansRouter);
app.use("/api", agenteRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] error no manejado:", err);
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "JSON inválido en el body." });
    return;
  }
  const mensaje = err instanceof Error ? err.message : "Error interno.";
  res.status(500).json({ error: mensaje });
});

app.listen(PORT, HOST, () => {
  console.log(`Aduana escuchando en http://${HOST}:${PORT}`);
});
