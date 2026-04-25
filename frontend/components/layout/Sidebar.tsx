"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Briefcase, Compass, Home, UserCircle } from "lucide-react";

const NAV_ITEMS = [
  { href: "/trips", label: "旅遊", icon: Briefcase },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/hotels", label: "住宿", icon: Home },
  { href: "/profile", label: "我的", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[220px] bg-white z-10"
      style={{ boxShadow: "2px 0px 12px 0px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center gap-3 px-4 pt-6 pb-2">
        <div
          className="w-[53px] h-[53px] rounded-[12px] overflow-hidden flex-shrink-0 flex items-center justify-center"
        >
          <Image
            src="/taibear-icon-trimmed.png"
            alt="Taibear"
            width={64}
            height={64}
            className="object-cover"
          />
        </div>
        <span className="text-[24px] font-bold leading-none" style={{ color: "#3abdff" }}>
          Taibear
        </span>
      </div>

      <nav className="mt-4 flex flex-col gap-1 px-[20px]">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 w-[180px] h-[48px] px-3 rounded-[12px] transition-colors"
              style={
                active
                  ? { background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }
                  : {}
              }
            >
              <Icon size={24} color={active ? "#fff" : "#999"} strokeWidth={active ? 2 : 1.5} />
              <span
                className="text-[15px] leading-none"
                style={{ color: active ? "#fff" : "#999", fontWeight: active ? 600 : 400 }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
