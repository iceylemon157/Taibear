import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {/* Mobile nav */}
      <MobileTopBar />
      <MobileBottomNav />

      <div className="h-full flex">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        <main className="
          flex-1 min-h-screen overflow-auto
          pt-[76px] pb-[84px]
          md:pt-0 md:pb-0 md:ml-[220px]
        ">
          {children}
        </main>
      </div>
    </Providers>
  );
}
