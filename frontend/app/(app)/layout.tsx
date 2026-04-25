import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="h-full flex">
        <Sidebar />
        <main className="ml-[220px] flex-1 min-h-screen overflow-auto">
          {children}
        </main>
      </div>
    </Providers>
  );
}
