type ChatMessage = {
  role: string;
  content: string;
};

export function buildSessionTitle(
  question: string
): string {
  const title = question.trim().replace(/\s+/g, " ");

  if (!title) {
    return "New Chat";
  }

  return title.length > 60
    ? `${title.slice(0, 57)}...`
    : title;
}

export function formatConversationHistory(
  messages: ChatMessage[]
): string {
  return messages
    .map(
      (message) =>
        `${message.role}: ${message.content}`
    )
    .join("\n");
}

export function extractSseData(
  streamText: string
): string {
  return streamText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) =>
      line.replace(/^data:\s?/, "")
    )
    .join("");
}

export function normalizeSessionId(
  id?: string | null
): string | null {
  if (
    !id ||
    id === "undefined" ||
    id === "null" ||
    id.trim() === ""
  ) {
    return null;
  }

  return id;
}