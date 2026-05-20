export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  htmlLink?: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  events?: CalendarEventSummary[];
  eventLink?: string;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  message: string;
  data?: T;
}
