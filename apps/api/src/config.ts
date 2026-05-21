import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.resolve(currentDir, "../.env");
const rootEnvPath = path.resolve(currentDir, "../../../.env");

dotenv.config({ path: apiEnvPath });
dotenv.config({ path: rootEnvPath });

export const config = {
  apiPort: Number(process.env.API_PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      "http://localhost:4000/auth/google/callback",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary"
  }
};

export function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
