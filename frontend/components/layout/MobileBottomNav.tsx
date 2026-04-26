"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Compass, Home, UserCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

const NAV_ITEMS = [
  { href: "/trips", labelKey: "nav.trips", icon: Briefcase },
  { href: "/explore", labelKey: "nav.explore", icon: Compass },
  { href: "/hotels", labelKey: "nav.hotels", icon: Home },
  { href: "/profile", labelKey: "nav.profile", icon: UserCircle },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 h-[84px] bg-white z-20 flex items-center px-1"
      style={{ boxShadow: "0px -1px 0px rgba(0,0,0,0.06)" }}
    >
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center h-[56px] rounded-[12px] transition-all"
            style={
              active
                ? { background: "linear-gradient(to right, #3abdff, #9cd8ed, #fef3da)" }
                : {}
            }
          >
            <Icon size={22} color={active ? "#fff" : "#999"} strokeWidth={active ? 2 : 1.5} />
            <span
              className="text-[13px] mt-0.5 leading-none"
              style={{ color: active ? "#fff" : "#999", fontWeight: active ? 600 : 400 }}
            >
              {t(labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
