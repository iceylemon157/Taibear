import { apiRequest } from "@/services/api/client";
import { getSession } from "@/services/auth/session";

export async function postUserTags(userId: string, tags: string[]): Promise<void> {
  const effectiveUserId = userId === "me" ? getSession()?.userId : userId;

  if (!effectiveUserId) {
    return;
  }

  await apiRequest(`/api/bff/users/${encodeURIComponent(effectiveUserId)}`, {
    method: "PUT",
    body: { selected_tags: tags },
  });
}