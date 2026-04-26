"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/useI18n";

const CONIC_BG =
  "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)";

export default function LandingPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const fade = (delay: string, extraTransform?: string) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : `translateY(${extraTransform ?? "16px"})`,
    transition: `opacity 0.8s ease ${delay}, transform 0.8s ease ${delay}`,
  });

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center"
      style={{ background: CONIC_BG }}
    >
      {/* ── Auth buttons ─────────────────────────────────────────────────────── */}
      {/* Desktop: top-right */}
      <div
        className="absolute hidden md:flex items-center gap-2 top-[50px] right-[60px]"
        style={fade("0.8s", "-12px")}
      >
        <AuthButtons />
      </div>

      {/* Mobile: top, split left/right */}
      <div
        className="absolute flex md:hidden items-center justify-between w-full px-[68px] top-6"
        style={fade("0.8s", "-12px")}
      >
        <AuthButtons />
      </div>

      {/* ── Illustration ─────────────────────────────────────────────────────── */}
      <div
        style={{
          ...fade("0.1s", "24px"),
          animation: visible ? "tbFloat 6s ease-in-out infinite" : "none",
          animationDelay: "1s",
          position: "relative",
          zIndex: 1,
          marginBottom: 8,
        }}
      >
        {/* Desktop */}
        <Image
          src="/landing.png"
          alt="Taipei city illustration"
          width={820}
          height={638}
          priority
          className="hidden md:block select-none"
          style={{ mixBlendMode: "multiply", filter: "drop-shadow(0px 16px 40px rgba(0,0,0,0.08))" }}
        />
        {/* Mobile */}
        <Image
          src="/landing.png"
          alt="Taipei city illustration"
          width={340}
          height={262}
          priority
          className="block md:hidden select-none"
          style={{ mixBlendMode: "multiply", filter: "drop-shadow(0px 8px 24px rgba(0,0,0,0.08))" }}
        />
      </div>

      {/* ── "Taibear" watermark ───────────────────────────────────────────────── */}
      <div
        style={{
          ...fade("0.5s"),
          marginTop: -16,
          position: "relative",
          zIndex: 0,
          textAlign: "center",
        }}
      >
        {/* Desktop */}
        <span
          className="hidden md:inline font-bold select-none"
          style={{ fontSize: 96, lineHeight: 1, color: "rgba(26,26,26,0.15)", letterSpacing: "-2px" }}
        >
          Taibear
        </span>
        {/* Mobile */}
        <span
          className="inline md:hidden font-bold select-none"
          style={{ fontSize: 53, lineHeight: 1, color: "rgba(26,26,26,0.18)", letterSpacing: "-1px" }}
        >
          Taibear
        </span>
      </div>

      {/* ── Copyright ────────────────────────────────────────────────────────── */}
      <p
        className="absolute bottom-6 text-[14px]"
        style={{ color: "#999", ...fade("1.2s") }}
      >
        © 2026 Taibear
      </p>

      <style>{`
        @keyframes tbFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
      `}</style>
    </div>
  );
}

function AuthButtons() {
  const { t } = useI18n();

  return (
    <>
      <Link
        href="/login"
        className="h-[36px] px-6 rounded-[20px] flex items-center text-[15px] font-semibold text-white whitespace-nowrap"
        style={{ background: "rgba(255,210,106,0.82)", boxShadow: "inset 0px 4px 4px rgba(0,0,0,0.12)" }}
      >
        {t("landing.login")}
      </Link>
      <Link
        href="/signup"
        className="h-[36px] px-6 rounded-[20px] flex items-center text-[15px] font-semibold whitespace-nowrap"
        style={{ background: "white", color: "#ffd26a", boxShadow: "inset 0px 0px 4px rgba(0,0,0,0.15)" }}
      >
        {t("landing.signup")}
      </Link>
    </>
  );
}
