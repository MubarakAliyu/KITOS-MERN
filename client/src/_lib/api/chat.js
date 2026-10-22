import { apiClient } from "./client";

/**
 * Returns conversations for a viewer. Pass `userId` (e.g. "s1", "i1",
 * "p1", "admin1") so the backend projects the right participant for each
 * side of the conversation.
 */
export async function getConversations(userId) {
  const url = userId ? `/conversations?user_id=${userId}` : "/conversations";
  const { data } = await apiClient.get(url);
  return data;
}

export async function getMessages(conversationId) {
  const { data } = await apiClient.get(
    `/messages?conversation_id=${conversationId}`
  );
  return data;
}

export async function sendMessage(payload) {
  const { data } = await apiClient.post("/messages", payload);
  return data;
}

export async function markMessagesRead(conversationId) {
  const { data } = await apiClient.put("/messages/read", {
    conversation_id: conversationId,
  });
  return data;
}

/** Admin monitor — every conversation across every role. */
export async function getAllConversations() {
  const { data } = await apiClient.get("/admin/chat/all-conversations");
  return data;
}
