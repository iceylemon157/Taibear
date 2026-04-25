export type UserSession = {
  userId: string;
  displayName: string;
};

const SESSION_KEY = "taibear.session";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getSession(): UserSession | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed.userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(session: UserSession): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
}
