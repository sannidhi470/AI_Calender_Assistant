import type { CalendarEventSummary } from "@ai-calendar-assistant/shared";
import { google, type calendar_v3 } from "googleapis";

import { config, requireConfig } from "../config.js";
import { addMinutes, parseDateTime, resolveDateRange } from "../dates.js";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    requireConfig(config.google.clientId, "GOOGLE_CLIENT_ID"),
    requireConfig(config.google.clientSecret, "GOOGLE_CLIENT_SECRET"),
    config.google.redirectUri
  );

  if (config.google.refreshToken) {
    client.setCredentials({ refresh_token: config.google.refreshToken });
  }

  return client;
}

function getCalendarClient() {
  if (!config.google.refreshToken) {
    throw new Error(
      "Google Calendar is not authorized yet. Visit /auth/google and add the returned refresh token to GOOGLE_REFRESH_TOKEN."
    );
  }

  return google.calendar({ version: "v3", auth: getOAuthClient() });
}

function normalizeEvent(event: calendar_v3.Schema$Event): CalendarEventSummary {
  return {
    id: event.id ?? "",
    title: event.summary ?? "Untitled event",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    htmlLink: event.htmlLink ?? undefined
  };
}

export function getGoogleAuthUrl(): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [CALENDAR_SCOPE]
  });
}

export async function exchangeGoogleCodeForTokens(code: string) {
  const { tokens } = await getOAuthClient().getToken(code);
  return tokens;
}

export async function createCalendarEvent(input: {
  title: string;
  datetime: string;
  durationMinutes: number;
}): Promise<CalendarEventSummary> {
  const calendar = getCalendarClient();
  const start = parseDateTime(input.datetime);
  const end = addMinutes(start, input.durationMinutes);

  const { data } = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: input.title,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    }
  });

  return normalizeEvent(data);
}

export async function listCalendarEvents(
  dateRange: string
): Promise<CalendarEventSummary[]> {
  const calendar = getCalendarClient();
  const { timeMin, timeMax } = resolveDateRange(dateRange);

  const { data } = await calendar.events.list({
    calendarId: config.google.calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime"
  });

  return (data.items ?? []).map(normalizeEvent).filter((event) => event.id);
}

export async function updateCalendarEvent(input: {
  eventId: string;
  changes: {
    title?: string;
    datetime?: string;
    durationMinutes?: number;
  };
}): Promise<CalendarEventSummary> {
  const calendar = getCalendarClient();
  const existing = await calendar.events.get({
    calendarId: config.google.calendarId,
    eventId: input.eventId
  });

  const current = existing.data;
  const patch: calendar_v3.Schema$Event = {};

  if (input.changes.title) {
    patch.summary = input.changes.title;
  }

  if (input.changes.datetime || input.changes.durationMinutes) {
    const start = input.changes.datetime
      ? parseDateTime(input.changes.datetime)
      : parseDateTime(current.start?.dateTime ?? current.start?.date ?? "");
    const existingEnd = parseDateTime(
      current.end?.dateTime ?? current.end?.date ?? ""
    );
    const existingStart = parseDateTime(
      current.start?.dateTime ?? current.start?.date ?? ""
    );
    const durationMinutes =
      input.changes.durationMinutes ??
      Math.max(15, Math.round((existingEnd.getTime() - existingStart.getTime()) / 60000));

    patch.start = { dateTime: start.toISOString() };
    patch.end = { dateTime: addMinutes(start, durationMinutes).toISOString() };
  }

  const { data } = await calendar.events.patch({
    calendarId: config.google.calendarId,
    eventId: input.eventId,
    requestBody: patch
  });

  return normalizeEvent(data);
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();

  await calendar.events.delete({
    calendarId: config.google.calendarId,
    eventId
  });
}
