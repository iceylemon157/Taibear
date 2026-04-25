"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ApiError } from "@/services/api/client";
import { authService } from "@/services/api/services";
import {
  clearSession,
  getSession,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  setSession,
} from "@/services/auth/session";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      const current = getSession();
      if (!current) {
        const nextPath = pathname || "/trips";
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      let working = current;

      if (isAccessTokenExpired(working)) {
        if (isRefreshTokenExpired(working)) {
          clearSession();
          const nextPath = pathname || "/trips";
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        try {
          const refreshed = await authService.refresh(working.refreshToken);
          working = {
            ...working,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
            refreshTokenExpiresAt: Date.now() + refreshed.refresh_expires_in * 1000,
          };
          setSession(working);
        } catch {
          clearSession();
          const nextPath = pathname || "/trips";
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }
      }

      try {
        const me = await authService.me(working.accessToken);
        working = {
          ...working,
          userId: me.user.user_id,
          displayName: me.user.display_name || me.user.user_id,
        };
        setSession(working);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && !isRefreshTokenExpired(working)) {
          try {
            const refreshed = await authService.refresh(working.refreshToken);
            const withNewTokens = {
              ...working,
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
              refreshTokenExpiresAt: Date.now() + refreshed.refresh_expires_in * 1000,
            };
            const me = await authService.me(withNewTokens.accessToken);
            setSession({
              ...withNewTokens,
              userId: me.user.user_id,
              displayName: me.user.display_name || me.user.user_id,
            });
          } catch {
            clearSession();
            const nextPath = pathname || "/trips";
            router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
            return;
          }
        } else {
          clearSession();
          const nextPath = pathname || "/trips";
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }
      }

      if (!cancelled) {
        setReady(true);
      }
    }

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "#999" }}>
        正在載入使用者資料...
      </div>
    );
  }

  return <>{children}</>;
}
