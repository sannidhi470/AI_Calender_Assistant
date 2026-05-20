import type {
  CalendarEventSummary,
  ChatMessage,
  ChatResponse,
  EventConfirmationRequest,
  PendingEventConfirmation
} from "@ai-calendar-assistant/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type UiMessage = ChatMessage & {
  id: string;
  events?: CalendarEventSummary[];
  eventLink?: string;
  pendingConfirmation?: PendingEventConfirmation;
};

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  confirmation?: EventConfirmationRequest
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, history, confirmation })
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(error?.error ?? "Unable to reach the calendar assistant.");
  }

  return response.json() as Promise<ChatResponse>;
}
