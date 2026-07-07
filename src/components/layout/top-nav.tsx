"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/memories", label: "Memories" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch("/api/review")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPendingCount(data.length);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <nav className="maze-nav">
      <div className="h-full max-w-[1200px] mx-auto px-6 lg:px-10 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-lg overflow-hidden transition-transform group-hover:scale-105">
            <Image src="/icon.svg" alt="Cortex" width={32} height={32} className="h-full w-full" />
          </div>
          <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
            Cortex
          </span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3.5 py-2 rounded-lg text-[13px] font-normal tracking-[-0.01em] transition-colors ${
                  isActive
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
                style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
              >
                {link.label}
                {link.href === "/review" && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full bg-lime text-[9px] font-medium text-lime-foreground shadow-sm">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-lime maze-pulse" />
          <span className="text-[11px] text-muted-foreground font-normal tracking-wide uppercase" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
            Active
          </span>
        </div>
      </div>
    </nav>
  );
}
