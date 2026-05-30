export function buildSessionTitle(question) {
    const title = question.trim().replace(/\s+/g, " ");
    if (!title) {
        return "New Chat";
    }
    return title.length > 60
        ? `${title.slice(0, 57)}...`
        : title;
}
export function formatConversationHistory(messages) {
    return messages
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
}
export function extractSseData(streamText) {
    return streamText
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""))
        .join("");
}
export function normalizeSessionId(id) {
    if (!id ||
        id === "undefined" ||
        id === "null" ||
        id.trim() === "") {
        return null;
    }
    return id;
}
