"use client";

import Image from "next/image";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export function MobileTopBar() {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 h-[76px] bg-white z-20 flex items-center px-4"
      style={{ boxShadow: "0px 1px 0px rgba(0,0,0,0.06)" }}>
      <div className="w-[53px] h-[53px] rounded-[12px] overflow-hidden flex-shrink-0">
        <Image src="/taibear-icon-trimmed.png" alt="Taibear" width={64} height={64} className="object-cover" />
      </div>
      <span className="ml-3 text-[24px] font-bold leading-none" style={{ color: "#3abdff" }}>Taibear</span>
      <div className="ml-auto">
        <LanguageSwitcher compact />
      </div>
    </header>
  );
}
