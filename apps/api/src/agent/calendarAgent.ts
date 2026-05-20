import type {
  CalendarEventSummary,
  ChatMessage,
  ChatResponse
} from "@ai-calendar-assistant/shared";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { config } from "../config.js";
import {
  collectEventsFromToolResult,
  createLangChainCalendarTools
} from "../mcp/calendarTools.js";

const systemPrompt = `You are an AI Calendar Assistant connected to Google Calendar tools.

Rules:
- Use tools for all calendar reads and writes.
- If an event id is missing for update or delete, list likely events first, then choose the best match by title/time.
- Ask a concise follow-up question when required details are missing.
- Confirm every create, update, and delete in human-readable language.
- If create_event returns ok:false because of a conflict, do not call create_event again. Tell the user the slot is already booked and show the conflicting event(s).
- Include Google Calendar links when a tool result contains one.
- Use simple date phrases from the user directly; the tool layer can parse phrases like today, tomorrow, and this week.`;

function historyToMessages(history: ChatMessage[] = []): BaseMessage[] {
  return history.slice(-12).map((message) =>
    message.role === "assistant"
      ? new AIMessage(message.content)
      : new HumanMessage(message.content)
  );
}

function contentToText(content: AIMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .join("");
}

function extractGoogleCalendarLink(text: string): string | undefined {
  return text.match(/https:\/\/www\.google\.com\/calendar\/event\?[^)\s]+/)?.[0];
}

export async function runCalendarAgent(input: {
  message: string;
  history?: ChatMessage[];
}): Promise<ChatResponse> {
  if (!config.openAiApiKey) {
    return {
      reply:
        "OPENAI_API_KEY is not configured yet. Add it to apps/api/.env or your shell environment, then restart the API server."
    };
  }

  const tools = createLangChainCalendarTools();
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const model = new ChatOpenAI({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    temperature: 0.1
  }).bindTools(tools);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...historyToMessages(input.history),
    new HumanMessage(input.message)
  ];
  const collectedEvents: CalendarEventSummary[] = [];
  let eventLink: string | undefined;

  for (let step = 0; step < 6; step += 1) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const reply = contentToText(response.content);
      return {
        reply,
        events: collectedEvents.length > 0 ? collectedEvents : undefined,
        eventLink: eventLink ?? extractGoogleCalendarLink(reply)
      };
    }

    for (const toolCall of response.tool_calls) {
      const tool = toolsByName.get(toolCall.name);
      if (!tool) {
        continue;
      }

      const toolOutput = await tool.invoke(toolCall.args);
      const collected = collectEventsFromToolResult(toolOutput);
      collectedEvents.push(...collected.events);
      eventLink = eventLink ?? collected.eventLink;

      messages.push(
        new ToolMessage({
          content: toolOutput,
          tool_call_id: toolCall.id ?? toolCall.name
        })
      );
    }
  }

  return {
    reply:
      "I started working on that calendar request, but it needed too many tool steps. Please try again with a more specific event title or time.",
    events: collectedEvents.length > 0 ? collectedEvents : undefined,
    eventLink
  };
}
