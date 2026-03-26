import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  Database,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import type { AdminAccessState, AdminSection } from "@/lib/adminApi";

export type AdminNavItem = {
  key: AdminSection;
  label: string;
  description: string;
  icon: LucideIcon;
  accent?: "primary" | "accent" | "neutral";
  badge?: string | number | null;
  hidden?: boolean;
};

const ICONS: Record<AdminSection, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  subscriptions: BadgeDollarSign,
  entitlements: Sparkles,
  usage: Activity,
  "nutrition-data": Database,
  support: LifeBuoy,
  analytics: TrendingUp,
  system: Activity,
  security: ShieldCheck,
};

function getAccentClasses(accent: AdminNavItem["accent"], active: boolean): string {
  if (active) {
    return "border-primary/30 bg-primary text-primary-foreground shadow-glow-teal";
  }
  if (accent === "accent") {
    return "border-accent/15 bg-accent/5 text-accent hover:border-accent/35 hover:bg-accent/10";
  }
  if (accent === "neutral") {
    return "border-primary/10 bg-white/70 text-zinc-600 hover:border-primary/20 hover:bg-primary/5";
  }
  return "border-primary/12 bg-primary/5 text-primary hover:border-primary/25 hover:bg-primary/10";
}

export function getAdminNavItems(
  access: AdminAccessState | null,
  badges?: Partial<Record<AdminSection, string | number | null>>,
): AdminNavItem[] {
  const roles = new Set(access?.roles ?? []);
  const isOwner = access?.isOwner === true || roles.has("super_admin");
  const canBilling = isOwner || roles.has("billing_admin");
  const canSupport = isOwner || roles.has("support_admin");
  const canContent = isOwner || roles.has("content_admin");
  const canAnalytics = isOwner || roles.has("analyst") || canBilling;

  const items: AdminNavItem[] = [
    {
      key: "overview",
      label: "Tổng quan",
      description: "KPI, active users, revenue và issue feed",
      icon: ICONS.overview,
      accent: "primary",
      badge: badges?.overview,
    },
    {
      key: "users",
      label: "User management",
      description: "Customer canonical, identities và support actions",
      icon: ICONS.users,
      accent: "neutral",
      badge: badges?.users,
      hidden: !(canSupport || canBilling),
    },
    {
      key: "subscriptions",
      label: "Subscriptions",
      description: "Plans, payments, trial, refunds và billing health",
      icon: ICONS.subscriptions,
      accent: "accent",
      badge: badges?.subscriptions,
      hidden: !canBilling,
    },
    {
      key: "entitlements",
      label: "Entitlements",
      description: "Feature flags, plan matrix và override logic",
      icon: ICONS.entitlements,
      accent: "primary",
      badge: badges?.entitlements,
      hidden: !canBilling,
    },
    {
      key: "usage",
      label: "Usage & quota",
      description: "AI calls, scan volume, abuse hotspots và cost",
      icon: ICONS.usage,
      accent: "neutral",
      badge: badges?.usage,
      hidden: !(canBilling || canSupport || canAnalytics),
    },
    {
      key: "nutrition-data",
      label: "Nutrition data",
      description: "Food DB, aliases, portions, candidates và CSV",
      icon: ICONS["nutrition-data"],
      accent: "primary",
      badge: badges?.["nutrition-data"],
      hidden: !canContent,
    },
    {
      key: "support",
      label: "Support",
      description: "Customer 360, notes, quota reset và repair flows",
      icon: ICONS.support,
      accent: "neutral",
      badge: badges?.support,
      hidden: !canSupport,
    },
    {
      key: "analytics",
      label: "Analytics",
      description: "Growth, signup, conversion, retention và cohort signals",
      icon: ICONS.analytics,
      accent: "accent",
      badge: badges?.analytics,
      hidden: !canAnalytics,
    },
    {
      key: "system",
      label: "System",
      description: "Schema readiness, webhook, queue và health state",
      icon: ICONS.system,
      accent: "neutral",
      badge: badges?.system,
    },
    {
      key: "security",
      label: "Security",
      description: "Admin roles, audit trail và break-glass owner state",
      icon: ICONS.security,
      accent: "accent",
      badge: badges?.security,
      hidden: !isOwner,
    },
  ];

  return items.filter((item) => !item.hidden);
}

type AdminSidebarProps = {
  items: AdminNavItem[];
  section: AdminSection;
  onSelect: (section: AdminSection) => void;
  access: AdminAccessState | null;
};

export function AdminSidebar({ items, section, onSelect, access }: AdminSidebarProps) {
  return (
    <>
      <aside className="hidden xl:flex xl:w-[280px] xl:flex-col xl:gap-4 xl:rounded-[32px] xl:border xl:border-primary/10 xl:bg-white/80 xl:p-4 xl:shadow-md xl:backdrop-blur">
        <div className="rounded-[28px] border border-primary/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(8,145,178,0.08),rgba(249,115,22,0.08))] p-5">
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            CaloTrack Backoffice
          </div>
          <h2 className="text-xl font-semibold text-foreground">Admin area cho SaaS đa kênh</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Phone number là customer canonical. Telegram và Zalo là kênh sử dụng, còn web giữ vai trò checkout, activation và admin.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-primary">Teal core</span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-accent">Flame accent</span>
            <span className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-zinc-500">
              {access?.isOwner ? "Owner" : "Role-aware"}
            </span>
          </div>
        </div>

        <nav className="space-y-2">
          {items.map((item) => {
            const active = item.key === section;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={`group flex w-full items-start gap-3 rounded-[24px] border px-4 py-3 text-left transition ${getAccentClasses(item.accent, active)}`}
              >
                <span className={`mt-0.5 rounded-2xl p-2 ${active ? "bg-white/15" : "bg-white/80 text-current"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.label}</span>
                    {item.badge != null && item.badge !== "" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-white/15 text-white" : "bg-white/90 text-zinc-500"}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/85" : "text-zinc-500"}`}>
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="xl:hidden">
        <div className="rounded-[28px] border border-primary/10 bg-white/85 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Admin mobile</div>
              <div className="text-sm text-zinc-600">Backoffice vận hành tốt nhất trên desktop hoặc tablet.</div>
            </div>
            <div className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              Read-friendly
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item) => {
              const active = item.key === section;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={`flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-glow-teal"
                      : "border-primary/12 bg-white text-zinc-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
