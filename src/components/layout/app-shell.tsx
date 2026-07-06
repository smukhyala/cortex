"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "./top-nav";

const MARKETING_ROUTES = ["/landing"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketing = MARKETING_ROUTES.some((r) => pathname.startsWith(r));

  if (isMarketing) {
    return <>{children}</>;
  }

  return (
    <>
      <TopNav />
      <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-6">
        {children}
      </main>
    </>
  );
}
