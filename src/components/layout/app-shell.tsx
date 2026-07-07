"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "./top-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketing = pathname === "/" || pathname.startsWith("/landing");

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
