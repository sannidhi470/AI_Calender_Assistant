import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  EventConfirmationOption
} from "@ai-calendar-assistant/shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { sendChatMessage, type UiMessage } from "./api";

const examples = [
  "Schedule a meeting tomorrow at 6 PM for 1 hour",
  "What do I have this week?",
  "Move my 3 PM meeting to 5 PM",
  "Cancel my 6 PM event"
];
const CHAT_STORAGE_KEY = "ai-calendar-assistant:messages";
const welcomeMessage: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi, I can help manage your Google Calendar. Try asking me to schedule, list, move, or cancel an event."
};
type ActivityStatus = {
  title: string;
  detail: string;
};

function newId() {
  return crypto.randomUUID();
}

function loadStoredMessages(): UiMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);

    if (!stored) {
      return [welcomeMessage];
    }

    const parsed = JSON.parse(stored) as UiMessage[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [welcomeMessage];
    }

    return parsed.map((message) => ({
      ...message,
      pendingConfirmation: undefined
    }));
  } catch {
    return [welcomeMessage];
  }
}

function saveMessages(messages: UiMessage[]) {
  const serializableMessages = messages.map((message) => ({
    ...message,
    pendingConfirmation: undefined
  }));

  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(serializableMessages));
}

function getActivityStatus(message: string): ActivityStatus {
  const normalized = message.toLowerCase();

  if (/\b(cancel|delete|remove)\b/.test(normalized)) {
    return {
      title: "Canceling event...",
      detail: "Finding the matching calendar event before deleting it."
    };
  }

  if (/\b(move|reschedule|update|change)\b/.test(normalized)) {
    return {
      title: "Updating event...",
      detail: "Checking your calendar and preparing the event changes."
    };
  }

  if (/\b(schedule|book|create|add|set up)\b/.test(normalized)) {
    return {
      title: "Creating event...",
      detail: "Checking availability before adding anything to your calendar."
    };
  }

  if (/\b(what|list|show|have|events?|calendar|week|today|tomorrow)\b/.test(normalized)) {
    return {
      title: "Checking calendar...",
      detail: "Reading your calendar events for the requested time range."
    };
  }

  return {
    title: "Thinking...",
    detail: "Deciding which calendar tool should handle this request."
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function MessageBubble({
  message,
  onConfirm,
  isSending
}: {
  message: UiMessage;
  onConfirm: (option: EventConfirmationOption) => void;
  isSending: boolean;
}) {
  const isUser = message.role === "user";
  const markdownLinkClass = isUser
    ? "font-semibold text-white underline"
    : "font-semibold text-blue-600 hover:text-blue-700";

  return (
    <article
      className={`rounded-3xl px-5 py-4 shadow-sm ${
        isUser
          ? "ml-auto bg-blue-600 text-white"
          : "mr-auto border border-slate-200 bg-white text-slate-900"
      } max-w-[82%]`}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
      ) : (
        <div className="prose prose-sm max-w-none prose-slate leading-6">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, ...props }) => (
                <a
                  {...props}
                  className={markdownLinkClass}
                  target="_blank"
                  rel="noreferrer"
                >
                  {children}
                </a>
              ),
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
                  {children}
                </ul>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-950">
                  {children}
                </strong>
              )
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {message.events && message.events.length > 0 ? (
        <div className="mt-4 space-y-3">
          {message.events.map((event) => (
            <div
              key={event.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-800"
            >
              <p className="font-medium">{event.title}</p>
              <p className="mt-1 text-xs text-slate-600">
                {formatDateTime(event.start)} - {formatDateTime(event.end)}
              </p>
              {event.htmlLink ? (
                <a
                  className="mt-2 inline-flex text-xs font-semibold text-blue-600 hover:text-blue-700"
                  href={event.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Calendar
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {message.pendingConfirmation ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.pendingConfirmation.options.map((option) => (
            <button
              key={option.event.id}
              type="button"
              disabled={isSending}
              onClick={() => onConfirm(option)}
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Select {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {message.eventLink && !message.events?.some((event) => event.htmlLink) ? (
        <a
          className={`mt-4 inline-flex text-sm font-semibold ${
            isUser ? "text-white underline" : "text-blue-600 hover:text-blue-700"
          }`}
          href={message.eventLink}
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Calendar
        </a>
      ) : null}
    </article>
  );
}

function ActivityBubble({ status }: { status: ActivityStatus }) {
  return (
    <div className="mr-auto max-w-[82%] rounded-3xl border border-blue-100 bg-white px-5 py-4 text-sm shadow-sm">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
        </span>
        <div>
          <p className="font-semibold text-slate-800">{status.title}</p>
          <p className="mt-1 text-xs text-slate-500">{status.detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<UiMessage[]>(loadStoredMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activityStatus, setActivityStatus] = useState<ActivityStatus | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      saveMessages(messages);
    } catch {
      // Ignore storage failures so private browsing or quota errors do not break chat.
    }
  }, [messages]);

  const apiHistory = useMemo<ChatMessage[]>(
    () =>
      messages.map(({ role, content }) => ({
        role,
        content
      })),
    [messages]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: UiMessage = {
      id: newId(),
      role: "user",
      content: trimmed
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);
    setActivityStatus(getActivityStatus(trimmed));
    setError(null);

    try {
      const response = await sendChatMessage(trimmed, apiHistory);
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content: response.reply,
          events: response.events,
          eventLink: response.eventLink,
          pendingConfirmation: response.pendingConfirmation
        }
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content: `I could not complete that request: ${message}`
        }
      ]);
    } finally {
      setIsSending(false);
      setActivityStatus(null);
      inputRef.current?.focus();
    }
  }

  async function handleConfirmation(option: EventConfirmationOption) {
    if (isSending) {
      return;
    }

    const userMessage: UiMessage = {
      id: newId(),
      role: "user",
      content: `Use ${option.label}`
    };

    setMessages((current) => [...current, userMessage]);
    setIsSending(true);
    setActivityStatus(
      option.confirmation.action === "delete"
        ? {
            title: "Canceling event...",
            detail: "Deleting the selected event from Google Calendar."
          }
        : {
            title: "Updating event...",
            detail: "Applying the selected change to Google Calendar."
          }
    );
    setError(null);

    try {
      const response = await sendChatMessage(
        userMessage.content,
        apiHistory,
        option.confirmation
      );
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content: response.reply,
          events: response.events,
          eventLink: response.eventLink,
          pendingConfirmation: response.pendingConfirmation
        }
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          content: `I could not complete that confirmation: ${message}`
        }
      ]);
    } finally {
      setIsSending(false);
      setActivityStatus(null);
      inputRef.current?.focus();
    }
  }

  function handleClearHistory() {
    setMessages([welcomeMessage]);
    setError(null);
    setActivityStatus(null);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    inputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white/80 shadow-2xl shadow-slate-200/60 backdrop-blur">
        <header className="border-b border-slate-200 px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
            AI Calendar Assistant
          </p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                Manage Google Calendar by chat
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                The agent uses LangChain tool calling and a modular MCP-style
                Calendar tool layer to create, list, update, and delete events.
              </p>
            </div>
            <a
              href={`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/auth/google`}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Connect Google
            </a>
            <button
              type="button"
              onClick={handleClearHistory}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Clear chat
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onConfirm={handleConfirmation}
              isSending={isSending}
            />
          ))}
          {isSending && activityStatus ? (
            <ActivityBubble status={activityStatus} />
          ) : null}
        </div>

        <footer className="border-t border-slate-200 bg-white px-6 py-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => {
                  setInput(example);
                  inputRef.current?.focus();
                }}
              >
                {example}
              </button>
            ))}
          </div>

          <form className="flex gap-3" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Ask me to schedule, list, move, or cancel events..."
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={isSending || input.trim().length === 0}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              Send
            </button>
          </form>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </footer>
      </section>
    </main>
  );
}
