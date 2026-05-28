"use client";

import { useRef, useState, useSyncExternalStore } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "/api/chat";
const SESSION_STORAGE_KEY = "rag_session_id";
const SESSION_STORAGE_EVENT = "rag-session-storage-change";

function getStoredSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

function getServerSessionId() {
  return null;
}

function subscribeToStoredSession(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SESSION_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SESSION_STORAGE_EVENT, onStoreChange);
  };
}

function writeStoredSessionId(sessionId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(SESSION_STORAGE_EVENT));
}

function useStoredSessionId() {
  const sessionId = useSyncExternalStore(
    subscribeToStoredSession,
    getStoredSessionId,
    getServerSessionId,
  );

  return [sessionId, writeStoredSessionId] as const;
}

function readSseMessages(buffer: string) {
  const messages: string[] = [];
  const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
  const events = normalizedBuffer.split("\n\n");
  const remaining = events.pop() ?? "";

  for (const event of events) {
    const message = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data: ?/, ""))
      .join("\n");

    if (message && message !== "[DONE]") {
      messages.push(message);
    }
  }

  return {
    messages,
    remaining,
  };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [userRole, setUserRole] = useState("tourism_employee");
  const [department, setDepartment] = useState("tourism");
  const [docType, setDocType] = useState("travel_guide");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useStoredSessionId();
  const assistantDraftRef = useRef<string>("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError("Please enter a question.");
      return;
    }

    setLoading(true);
    setQuestion("");

    const newUserMessage: Message = {
      role: "user",
      content: trimmedQuestion,
    };

    const assistantMessage: Message = {
      role: "assistant",
      content: "",
    };

    assistantDraftRef.current = "";
    setMessages((prev) => [...prev, newUserMessage, assistantMessage]);

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          user_role: userRole,
          department,
          doc_type: docType,
          sessionId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Chat backend returned an error.");
      }

      if (!response.body) {
        throw new Error("Streaming response is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let sseBuffer = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          sseBuffer += chunk;
          const parsed = readSseMessages(sseBuffer);
          sseBuffer = parsed.remaining;

          assistantDraftRef.current += parsed.messages.join("");
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              role: "assistant",
              content: assistantDraftRef.current,
            };
            return updated;
          });
        }
      }

      const finalChunk = decoder.decode();
      if (finalChunk || sseBuffer) {
        const parsed = readSseMessages(`${sseBuffer}${finalChunk}\n\n`);
        assistantDraftRef.current += parsed.messages.join("");
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = {
            role: "assistant",
            content: assistantDraftRef.current,
          };
          return updated;
        });
      }

      const responseSession = response.headers.get("x-session-id");
      if (responseSession) {
        setSessionId(responseSession);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      if (!assistantDraftRef.current) {
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessage = updated.at(-1);

          if (lastMessage?.role === "assistant" && !lastMessage.content) {
            updated.pop();
          }

          return updated;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
    assistantDraftRef.current = "";
    setError("");
    setQuestion("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/50 backdrop-blur sm:p-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">RAG Chatbot</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Ask your knowledge base
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Sends requests to your Node backend on port 5000, which forwards them to the Python RAG service on port 8000.
              Uses the ingest metadata values from your pipeline: role names like `tourism_employee`, department `tourism`, and document type `travel_guide`.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={clearChat}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              New chat
            </button>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
              Session {sessionId ? sessionId.slice(0, 8) : "not started"}
            </span>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.6fr_1fr] md:gap-6">
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Access role
                  <select
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    value={userRole}
                    onChange={(event) => setUserRole(event.target.value)}
                  >
                    <option value="tourism_employee">tourism_employee</option>
                    <option value="tourism_admin">tourism_admin</option>
                    <option value="manager">manager</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Department
                  <select
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                  >
                    <option value="tourism">tourism</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                  Document type
                  <select
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    value={docType}
                    onChange={(event) => setDocType(event.target.value)}
                  >
                    <option value="travel_guide">travel_guide</option>
                  </select>
                </label>
              </div>

              <label className="space-y-3 text-sm font-medium text-slate-700">
                Ask a question
                <textarea
                  rows={4}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="What do I need to know about the latest policy?"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-slate-600">
                  {loading ? "Chatbot is generating a response..." : "Your chat will stream below after submission."}
                </span>
                <button
                  className="inline-flex items-center justify-center rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send question"}
                </button>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </form>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Chat history</p>
                <p className="text-xs text-slate-500">
                  Streaming from your Node backend and Python RAG service.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {messages.length} messages
              </span>
            </div>

            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
                  Start a conversation by asking a question.
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                    className={`rounded-3xl p-4 shadow-sm ${
                      message.role === "assistant"
                        ? "bg-slate-100 text-slate-900"
                        : "bg-white text-slate-900"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                      <span>{message.role === "assistant" ? "Assistant" : "You"}</span>
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
                    </div>
                    <p className="whitespace-pre-line text-sm leading-7">
                      {message.content || (message.role === "assistant" ? "Generating answer..." : "")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
