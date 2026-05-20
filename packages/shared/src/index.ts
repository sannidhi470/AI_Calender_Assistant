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

export interface EventConfirmationRequest {
  action: "update" | "delete";
  eventId: string;
  changes?: {
    title?: string;
    datetime?: string;
    durationMinutes?: number;
  };
}

export interface EventConfirmationOption {
  label: string;
  event: CalendarEventSummary;
  confirmation: EventConfirmationRequest;
}

export interface PendingEventConfirmation {
  prompt: string;
  options: EventConfirmationOption[];
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  confirmation?: EventConfirmationRequest;
}

export interface ChatResponse {
  reply: string;
  events?: CalendarEventSummary[];
  eventLink?: string;
  pendingConfirmation?: PendingEventConfirmation;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  message: string;
  data?: T;
}
