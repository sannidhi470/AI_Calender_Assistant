import type {
  CalendarEventSummary,
  ChatResponse,
  EventConfirmationRequest,
  PendingEventConfirmation
} from "@ai-calendar-assistant/shared";
import * as chrono from "chrono-node";

import {
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent
} from "../google/calendarClient.js";

const TIME_PATTERN =
  /\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/gi;

function detectIntent(message: string): "update" | "delete" | undefined {
  const normalized = message.toLowerCase();

  if (/\b(cancel|delete|remove)\b/.test(normalized)) {
    return "delete";
  }

  if (/\b(move|reschedule|update|change)\b/.test(normalized)) {
    return "update";
  }

  return undefined;
}

function extractTimes(message: string): string[] {
  return [...message.matchAll(TIME_PATTERN)].map((match) => match[0]);
}

function eventTimeMatches(event: CalendarEventSummary, targetTime: string): boolean {
  const eventStart = new Date(event.start);

  if (Number.isNaN(eventStart.getTime())) {
    return false;
  }

  const parsedTarget = chrono.parseDate(targetTime, eventStart);

  if (!parsedTarget) {
    return false;
  }

  return (
    eventStart.getHours() === parsedTarget.getHours() &&
    eventStart.getMinutes() === parsedTarget.getMinutes()
  );
}

function inferLookupRange(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("today")) {
    return "today";
  }

  if (normalized.includes("tomorrow")) {
    return "tomorrow";
  }

  if (
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalized
    )
  ) {
    return message;
  }

  return "this week";
}

function buildDateTimeOnEventDay(event: CalendarEventSummary, timePhrase: string) {
  const eventStart = new Date(event.start);
  const nextStart = chrono.parseDate(timePhrase, eventStart);

  if (!nextStart) {
    throw new Error(`Could not parse the new event time: ${timePhrase}`);
  }

  return nextStart.toISOString();
}

function formatEventLabel(event: CalendarEventSummary): string {
  const start = new Date(event.start);

  if (Number.isNaN(start.getTime())) {
    return event.title;
  }

  return `${event.title} at ${new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(start)}`;
}

export async function maybeCreateEventSelection(
  message: string
): Promise<ChatResponse | undefined> {
  const intent = detectIntent(message);

  if (!intent) {
    return undefined;
  }

  const times = extractTimes(message);
  const targetTime = times[0];
  const newTime = intent === "update" ? times.at(-1) : undefined;

  if (intent === "update" && (!newTime || newTime === targetTime)) {
    return undefined;
  }

  const events = await listCalendarEvents(inferLookupRange(message));
  const candidates = targetTime
    ? events.filter((event) => eventTimeMatches(event, targetTime))
    : events;

  if (candidates.length <= 1) {
    return undefined;
  }

  const prompt =
    intent === "delete"
      ? "I found multiple matching events. Which one should I cancel?"
      : "I found multiple matching events. Which one should I move?";
  const pendingConfirmation: PendingEventConfirmation = {
    prompt,
    options: candidates.slice(0, 6).map((event) => ({
      label: formatEventLabel(event),
      event,
      confirmation: {
        action: intent,
        eventId: event.id,
        changes:
          intent === "update" && newTime
            ? { datetime: buildDateTimeOnEventDay(event, newTime) }
            : undefined
      }
    }))
  };

  return {
    reply: prompt,
    events: pendingConfirmation.options.map((option) => option.event),
    pendingConfirmation
  };
}

export async function executeEventConfirmation(
  confirmation: EventConfirmationRequest
): Promise<ChatResponse> {
  if (confirmation.action === "delete") {
    await deleteCalendarEvent(confirmation.eventId);

    return {
      reply: "Done. I canceled the selected event."
    };
  }

  const event = await updateCalendarEvent({
    eventId: confirmation.eventId,
    changes: confirmation.changes ?? {}
  });

  return {
    reply: `Done. I updated **${event.title}** to ${event.start} - ${event.end}.`,
    events: [event],
    eventLink: event.htmlLink
  };
}
