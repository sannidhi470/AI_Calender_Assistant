import type {
  CalendarEventSummary,
  ToolResult
} from "@ai-calendar-assistant/shared";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  findCalendarConflicts,
  listCalendarEvents,
  updateCalendarEvent
} from "../google/calendarClient.js";

type McpToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<ToolResult>;
};

function serializeToolResult(result: ToolResult): string {
  return JSON.stringify(result);
}

function toolFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown tool error";
  return serializeToolResult({ ok: false, message });
}

const createEventSchema = z.object({
  title: z
    .string()
    .describe("Short title for the calendar event, such as Team meeting."),
  datetime: z
    .string()
    .describe("Natural language or ISO start date/time, such as tomorrow 6 PM."),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .default(60)
    .describe("Event duration in minutes. Default to 60 if unspecified.")
});

const listEventsSchema = z.object({
  dateRange: z
    .string()
    .default("today")
    .describe("Natural language range such as today, tomorrow, this week, or May 22.")
});

const updateEventSchema = z.object({
  eventId: z
    .string()
    .describe("Google Calendar event id. List events first if the user did not provide it."),
  changes: z.object({
    title: z.string().optional().describe("New event title."),
    datetime: z
      .string()
      .optional()
      .describe("New start date/time in natural language or ISO format."),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("New duration in minutes.")
  })
});

const deleteEventSchema = z.object({
  eventId: z
    .string()
    .describe("Google Calendar event id. List events first if the user did not provide it.")
});

export const mcpCalendarTools: McpToolDefinition[] = [
  {
    name: "create_event",
    description:
      "Create a Google Calendar event. Use this for scheduling or booking a meeting.",
    schema: createEventSchema,
    handler: async (rawInput) => {
      const input = createEventSchema.parse(rawInput);
      const conflicts = await findCalendarConflicts(input);

      if (conflicts.length > 0) {
        return {
          ok: false,
          message: `I did not create a duplicate event because ${conflicts.length} event(s) already overlap that time.`,
          data: conflicts
        };
      }

      const event = await createCalendarEvent(input);
      return {
        ok: true,
        message: `Created "${event.title}" from ${event.start} to ${event.end}.`,
        data: event
      };
    }
  },
  {
    name: "list_events",
    description:
      "List Google Calendar events for a day, week, or natural language date range.",
    schema: listEventsSchema,
    handler: async (rawInput) => {
      const { dateRange } = listEventsSchema.parse(rawInput);
      const events = await listCalendarEvents(dateRange);
      return {
        ok: true,
        message:
          events.length === 0
            ? `No events found for ${dateRange}.`
            : `Found ${events.length} event(s) for ${dateRange}.`,
        data: events
      };
    }
  },
  {
    name: "update_event",
    description:
      "Update a Google Calendar event by id. If the user references an event by time or title, call list_events first to find the id.",
    schema: updateEventSchema,
    handler: async (rawInput) => {
      const input = updateEventSchema.parse(rawInput);
      const event = await updateCalendarEvent(input);
      return {
        ok: true,
        message: `Updated "${event.title}" to ${event.start} - ${event.end}.`,
        data: event
      };
    }
  },
  {
    name: "delete_event",
    description:
      "Delete a Google Calendar event by id. If the user references an event by time or title, call list_events first to find the id.",
    schema: deleteEventSchema,
    handler: async (rawInput) => {
      const { eventId } = deleteEventSchema.parse(rawInput);
      await deleteCalendarEvent(eventId);
      return {
        ok: true,
        message: `Deleted event ${eventId}.`,
        data: { eventId }
      };
    }
  }
];

export function createLangChainCalendarTools() {
  return mcpCalendarTools.map(
    (tool) =>
      new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        func: async (input) => {
          try {
            return serializeToolResult(await tool.handler(input));
          } catch (error) {
            return toolFailure(error);
          }
        }
      })
  );
}

export function collectEventsFromToolResult(
  toolOutput: string
): { events: CalendarEventSummary[]; eventLink?: string } {
  try {
    const parsed = JSON.parse(toolOutput) as ToolResult<
      CalendarEventSummary | CalendarEventSummary[]
    >;
    const data = parsed.data;

    if (Array.isArray(data)) {
      return { events: data, eventLink: data.find((event) => event.htmlLink)?.htmlLink };
    }

    if (data && "id" in data) {
      return {
        events: [data],
        eventLink: data.htmlLink
      };
    }
  } catch {
    return { events: [] };
  }

  return { events: [] };
}
