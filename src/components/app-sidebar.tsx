"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Home,
  Brain,
  Inbox,
  Orbit,
  Settings,
} from "lucide-react";
import { CortexLogo } from "@/components/features/service-logos";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/memories", label: "Memories", icon: Brain },
  { href: "/review", label: "Review Queue", icon: Inbox, showBadge: true },
  { href: "/j-space", label: "J-Space", icon: Orbit },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch("/api/review?limit=1")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.total === "number") setPendingCount(data.total);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <Sidebar>
      <SidebarHeader className="p-5 pb-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/10">
            <CortexLogo size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Cortex</h1>
            <p className="text-[11px] text-muted-foreground">AI Memory Sync</p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="text-[13px]">{item.label}</span>
                    {item.showBadge && pendingCount > 0 ? (
                      <Badge className="ml-auto h-5 min-w-5 px-1.5 text-[10px] font-semibold bg-lime text-lime-foreground border-0">
                        {pendingCount}
                      </Badge>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-5 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-lime animate-pulse" />
          <span>System active</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
