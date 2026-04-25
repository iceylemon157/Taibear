import axios from "axios";

export async function postUserTags(userId: string, tags: string[]): Promise<void> {
  await axios.post(`/api/users/${userId}/tags`, { tags });
}
