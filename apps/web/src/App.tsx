import { FormEvent, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@ai-calendar-assistant/shared";

import { sendChatMessage, type UiMessage } from "./api";

const examples = [
  "Schedule a meeting tomorrow at 6 PM for 1 hour",
  "What do I have this week?",
  "Move my 3 PM meeting to 5 PM",
  "Cancel my 6 PM event"
];

function newId() {
  return crypto.randomUUID();
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

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";

  return (
    <article
      className={`rounded-3xl px-5 py-4 shadow-sm ${
        isUser
          ? "ml-auto bg-blue-600 text-white"
          : "mr-auto border border-slate-200 bg-white text-slate-900"
      } max-w-[82%]`}
    >
      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>

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

export default function App() {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: newId(),
      role: "assistant",
      content:
        "Hi, I can help manage your Google Calendar. Try asking me to schedule, list, move, or cancel an event."
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          eventLink: response.eventLink
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
      inputRef.current?.focus();
    }
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
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSending ? (
            <div className="mr-auto max-w-[82%] rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
              Thinking through the calendar request...
            </div>
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
