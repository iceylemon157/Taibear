"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center"
      style={{
        background:
          "conic-gradient(from 90deg at 50% 50%, rgb(254,243,218) -26%, rgb(208,239,255) 13%, rgb(231,241,237) 33%, rgb(251,243,221) 52%, rgb(253,243,219) 67%, rgb(254,243,218) 74%, rgb(208,239,255) 113%)",
      }}
    >
      {/* Top-right auth buttons */}
      <div
        className="absolute top-[50px] right-[60px] flex items-center gap-2"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.6s ease 0.8s, transform 0.6s ease 0.8s",
        }}
      >
        <Link
          href="/login"
          className="h-[36px] px-6 rounded-[20px] flex items-center text-[15px] font-semibold text-white"
          style={{
            background: "rgba(255,210,106,0.82)",
            boxShadow: "inset 0px 4px 4px rgba(0,0,0,0.12)",
          }}
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="h-[36px] px-6 rounded-[20px] flex items-center text-[15px] font-semibold"
          style={{
            background: "white",
            color: "#ffd26a",
            boxShadow: "inset 0px 0px 4px rgba(0,0,0,0.15)",
          }}
        >
          Sign up
        </Link>
      </div>

      {/* Floating illustration */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
          transition: "opacity 0.9s ease 0.1s, transform 0.9s ease 0.1s",
          animation: visible ? "tbFloat 6s ease-in-out infinite" : "none",
          animationDelay: "1s",
          position: "relative",
          zIndex: 1,
          marginBottom: 8,
        }}
      >
        <Image
          src="/landing.png"
          alt="Taipei city illustration"
          width={820}
          height={638}
          priority
          className="select-none"
          style={{
            mixBlendMode: "multiply",
            filter: "drop-shadow(0px 16px 40px rgba(0,0,0,0.08))",
          }}
        />
      </div>

      {/* "Taibear" watermark */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 1s ease 0.5s, transform 1s ease 0.5s",
          marginTop: -16,
          position: "relative",
          zIndex: 0,
        }}
      >
        <span
          className="font-bold select-none"
          style={{
            fontSize: 96,
            lineHeight: 1,
            color: "rgba(26,26,26,0.15)",
            letterSpacing: "-2px",
          }}
        >
          Taibear
        </span>
      </div>

      {/* Copyright */}
      <p
        className="absolute bottom-6 text-[14px]"
        style={{
          color: "#999",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.8s ease 1.2s",
        }}
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
