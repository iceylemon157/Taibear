export type UserSession = {
  userId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
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
    if (!parsed.userId || !parsed.accessToken || !parsed.refreshToken) {
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

export function isAccessTokenExpired(session: UserSession): boolean {
  return Date.now() >= session.accessTokenExpiresAt;
}

export function isRefreshTokenExpired(session: UserSession): boolean {
  return Date.now() >= session.refreshTokenExpiresAt;
}

export function getAuthorizationHeader(): string | null {
  const session = getSession();
  if (!session) {
    return null;
  }
  if (isAccessTokenExpired(session)) {
    return null;
  }
  return `Bearer ${session.accessToken}`;
}
