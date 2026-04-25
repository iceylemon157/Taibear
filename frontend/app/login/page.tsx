"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/services/api/client";
import { authService } from "@/services/api/services";
import { setSession } from "@/services/auth/session";

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage("");
    const userId = email.trim().toLowerCase();
    if (!userId) {
      setErrorMessage("請輸入 Email。");
      return;
    }
    if (!password) {
      setErrorMessage("請輸入密碼。");
      return;
    }

    setSubmitting(true);
    try {
      const result = await authService.login({
        user_id: userId,
        password,
      });

      setSession({
        userId: result.user.user_id,
        displayName: result.user.display_name || result.user.user_id,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        accessTokenExpiresAt: Date.now() + result.expires_in * 1000,
        refreshTokenExpiresAt: Date.now() + result.refresh_expires_in * 1000,
      });
      router.push("/trips");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          setErrorMessage("帳號或密碼錯誤。");
        } else {
          setErrorMessage(error.message || "登入失敗，請稍後再試。");
        }
      } else {
        setErrorMessage("登入失敗，請稍後再試。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative w-full min-h-screen flex flex-col items-center justify-center px-6 py-16 md:py-0 md:px-0"
      style={{ background: CONIC_BG }}
    >
      {/* Toggle: top-center on mobile, top-right on desktop */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:top-[50px] md:right-[60px]">
        <AuthToggle active="login" />
      </div>

      {/* Form area */}
      <div className="w-full max-w-[500px]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-[44px] h-[44px] md:w-[52px] md:h-[52px] rounded-[12px] overflow-hidden flex-shrink-0">
            <Image src="/taibear-icon-trimmed.png" alt="Taibear" width={64} height={64} className="object-cover" />
          </div>
          <span className="text-[36px] md:text-[48px] font-bold leading-none" style={{ color: "#3abdff" }}>Taibear</span>
        </div>

        {/* Title */}
        <h1 className="text-[26px] md:text-[32px] font-bold text-[#141414] mb-7">Nice to see you again</h1>

        <form onSubmit={handleSignIn} className="flex flex-col">
          {/* Email */}
          <label className="text-[13px] font-medium mb-2" style={{ color: "#999" }}>Login</label>
          <input
            type="text"
            placeholder="Email or phone number"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-[52px] md:h-[56px] bg-white rounded-[14px] px-4 text-[15px] text-[#141414] outline-none mb-4 border-none"
          />

          {/* Password */}
          <label className="text-[13px] font-medium mb-2" style={{ color: "#999" }}>Password</label>
          <div className="relative mb-3">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[52px] md:h-[56px] bg-white rounded-[14px] px-4 pr-12 text-[15px] text-[#141414] outline-none border-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#666] transition-colors"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          {/* Remember me + Forgot password */}
          <div className="flex items-center justify-between mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => setRemember((v) => !v)}
                className="relative w-[44px] h-[24px] rounded-[12px] transition-colors flex-shrink-0"
                style={{ background: remember ? "#3abdff" : "#c7c7c7" }}
              >
                <div
                  className="absolute top-[2px] w-[20px] h-[20px] bg-white rounded-[10px] transition-all"
                  style={{ left: remember ? "22px" : "2px" }}
                />
              </button>
              <span className="text-[13px] text-[#141414]">Remember me</span>
            </label>
            <button type="button" className="text-[13px] font-semibold" style={{ color: "#3abdff" }}>
              Forgot password?
            </button>
          </div>

          {/* Sign in */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-[52px] md:h-[56px] rounded-[16px] text-white text-[16px] font-bold mb-3 transition-opacity disabled:cursor-not-allowed disabled:opacity-70 hover:opacity-90"
            style={{ background: "#3abdff" }}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>

          {errorMessage ? (
            <p className="text-[13px] mb-5" style={{ color: "#d9534f" }}>
              {errorMessage}
            </p>
          ) : null}

          {/* Divider */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-[#e0e0e0]" />
            <span className="text-[13px]" style={{ color: "#999" }}>or</span>
            <div className="flex-1 h-px bg-[#e0e0e0]" />
          </div>

          {/* Google */}
          <button
            type="button"
            className="w-full h-[52px] md:h-[56px] rounded-[16px] bg-[#141414] text-white text-[15px] font-semibold flex items-center justify-center gap-3 mb-8 transition-opacity hover:opacity-90"
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <p className="text-center text-[14px]" style={{ color: "#999" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold" style={{ color: "#3abdff" }}>
              Sign up now
            </Link>
          </p>
        </form>
      </div>

      <p className="mt-10 md:absolute md:bottom-6 text-[14px]" style={{ color: "#999" }}>© 2026 Taibear</p>
    </div>
  );
}

function AuthToggle({ active }: { active: "login" | "signup" }) {
  const activeStyle = {
    background: "rgba(255,210,106,0.82)",
    boxShadow: "inset 0px 4px 4px rgba(0,0,0,0.12)",
    color: "white",
  };
  return (
    <div
      className="flex items-center h-[36px] rounded-[20px] bg-white overflow-hidden"
      style={{ boxShadow: "inset 0px 0px 4px rgba(0,0,0,0.25)" }}
    >
      <Link href="/login" className="h-full px-6 rounded-[20px] flex items-center text-[15px] font-semibold"
        style={active === "login" ? activeStyle : { color: "#ffd26a" }}>
        Log in
      </Link>
      <Link href="/signup" className="h-full px-6 rounded-[20px] flex items-center text-[15px] font-semibold"
        style={active === "signup" ? activeStyle : { color: "#ffd26a" }}>
        Sign up
      </Link>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
