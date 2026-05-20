import type { ChatRequest } from "@ai-calendar-assistant/shared";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { runCalendarAgent } from "./agent/calendarAgent.js";
import { config } from "./config.js";
import {
  exchangeGoogleCodeForTokens,
  getGoogleAuthUrl
} from "./google/calendarClient.js";

const app = express();

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-calendar-assistant-api" });
});

app.get("/auth/google", (_req, res, next) => {
  try {
    res.redirect(getGoogleAuthUrl());
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google/callback", async (req, res, next) => {
  try {
    const code = req.query.code;

    if (typeof code !== "string") {
      res.status(400).send("Missing OAuth code.");
      return;
    }

    const tokens = await exchangeGoogleCodeForTokens(code);
    res.type("html").send(`
      <main style="font-family: system-ui; max-width: 720px; margin: 48px auto; line-height: 1.5;">
        <h1>Google Calendar connected</h1>
        <p>Copy this refresh token into <code>GOOGLE_REFRESH_TOKEN</code> and restart the API server.</p>
        <pre style="white-space: pre-wrap; padding: 16px; background: #f3f4f6; border-radius: 12px;">${tokens.refresh_token ?? "No refresh token returned. Re-run /auth/google after revoking app access or keep prompt=consent."}</pre>
      </main>
    `);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req: Request<object, object, ChatRequest>, res, next) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const response = await runCalendarAgent({ message, history });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  console.error(error);
  res.status(500).json({ error: message });
});

app.listen(config.apiPort, () => {
  console.log(`API listening on http://localhost:${config.apiPort}`);
});
