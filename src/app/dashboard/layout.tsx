"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

/**
 * Sidebar navigation items for user dashboard
 */
const sidebarItems = [
  { href: "/dashboard", icon: "🏠", label: "Tổng quan" },
  { href: "/dashboard/streak", icon: "🔥", label: "Streak" },
  { href: "/dashboard/badges", icon: "🏆", label: "Huy hiệu" },
  { href: "/dashboard/billing", icon: "💳", label: "Thanh toán" },
  { href: "/dashboard/referrals", icon: "👥", label: "Giới thiệu" },
  { href: "/dashboard/settings", icon: "⚙️", label: "Cài đặt" },
];

/**
 * Dashboard Sidebar Component
 */
function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-800 bg-zinc-950">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-zinc-800 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-lg font-bold text-zinc-950">C</span>
        </div>
        <span className="text-lg font-semibold text-foreground">{APP_NAME}</span>
      </div>

      {/* User Card */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center">
            <span className="text-sm">👤</span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Người dùng</p>
            <p className="text-xs text-muted">Pro Member</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-zinc-800 hover:text-foreground"
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-zinc-800 hover:text-foreground transition-colors"
        >
          <span>🚪</span>
          <span>Đăng xuất</span>
        </Link>
      </div>
    </aside>
  );
}

/**
 * Dashboard Layout
 * Wraps all dashboard pages with sidebar navigation
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-zinc-800 bg-background/80 backdrop-blur-md px-6">
          <div className="flex-1">
            {/* Breadcrumb or search can go here */}
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted hover:text-foreground">
              🔔
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
