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
    return "border-primary/20 bg-gradient-to-r from-primary to-teal-500 text-white shadow-elegant";
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
  const isOwner = access?.isOwner === true || roles.has("owner");
  const isAdmin = isOwner || roles.has("admin");

  const items: AdminNavItem[] = [
    {
      key: "overview",
      label: "Tổng quan",
      description: "KPI vận hành, health state và nhịp xử lý hằng ngày",
      icon: ICONS.overview,
      accent: "primary",
      badge: badges?.overview,
      hidden: !isAdmin,
    },
    {
      key: "users",
      label: "Customer access",
      description: "Quản lý Free, Pro, Banned và trạng thái đa kênh trên customer truth",
      icon: ICONS.users,
      accent: "neutral",
      badge: badges?.users,
      hidden: !isAdmin,
    },
    {
      key: "subscriptions",
      label: "Payments",
      description: "Plan, trial, entitlement và thanh toán",
      icon: ICONS.subscriptions,
      accent: "accent",
      badge: badges?.subscriptions,
      hidden: !isAdmin,
    },
    {
      key: "entitlements",
      label: "Entitlements",
      description: "Plan matrix, override và thời hạn sử dụng",
      icon: ICONS.entitlements,
      accent: "primary",
      badge: badges?.entitlements,
      hidden: !isAdmin,
    },
    {
      key: "usage",
      label: "Usage & quota",
      description: "AI calls, quota pressure và abuse hotspots",
      icon: ICONS.usage,
      accent: "neutral",
      badge: badges?.usage,
      hidden: !isAdmin,
    },
    {
      key: "nutrition-data",
      label: "Nutrition data",
      description: "Food DB, aliases, portions, candidates và CSV import",
      icon: ICONS["nutrition-data"],
      accent: "primary",
      badge: badges?.["nutrition-data"],
      hidden: !isAdmin,
    },
    {
      key: "support",
      label: "Support",
      description: "Customer 360, support notes, repair flows và quota reset",
      icon: ICONS.support,
      accent: "neutral",
      badge: badges?.support,
      hidden: !isAdmin,
    },
    {
      key: "analytics",
      label: "Analytics",
      description: "Growth, conversion, retention và revenue signals",
      icon: ICONS.analytics,
      accent: "accent",
      badge: badges?.analytics,
      hidden: !isAdmin,
    },
    {
      key: "system",
      label: "System",
      description: "Schema readiness, webhooks, queues và audit health",
      icon: ICONS.system,
      accent: "neutral",
      badge: badges?.system,
      hidden: !isAdmin,
    },
    {
      key: "security",
      label: "Security",
      description: "Admin members, role changes và audit trail",
      icon: ICONS.security,
      accent: "accent",
      badge: badges?.security,
      hidden: !isAdmin,
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
  const roles = new Set(access?.roles ?? []);
  const roleLabel = access?.isOwner ? "Owner" : roles.has("admin") ? "Admin" : "User";

  return (
    <>
      <aside className="hidden xl:flex xl:w-[320px] xl:shrink-0 xl:flex-col xl:gap-5 xl:rounded-[36px] xl:border xl:border-primary/10 xl:bg-white/80 xl:p-6 xl:shadow-elegant xl:backdrop-blur-xl">
        <div className="rounded-[28px] border border-primary/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(8,145,178,0.08),rgba(249,115,22,0.08))] p-5">
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            CaloTrack Backoffice
          </div>
          <h2 className="text-xl font-semibold text-foreground">Bảng điều hành vận hành cho portal phone-first</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Theo dõi customer truth, entitlement, linked channels, billing và support flows trong một bề mặt
            rõ ràng để vận hành SaaS nhanh mà không cần đào sâu vào repair console ngay từ bước đầu.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-primary">
              Phone-first
            </span>
            <span className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-zinc-500">
              {roleLabel}
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
                className={`group flex w-full items-center gap-4 rounded-[24px] px-5 py-4 text-left transition-all duration-300 ${getAccentClasses(item.accent, active)}`}
              >
                <span className={`flex items-center justify-center rounded-2xl p-2.5 shadow-sm transition-colors ${active ? "bg-white/20 text-white" : "bg-white text-primary group-hover:bg-white"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.label}</span>
                    {item.badge != null && item.badge !== "" ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          active ? "bg-white/15 text-white" : "bg-white/90 text-zinc-500"
                        }`}
                      >
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
              <div className="text-sm text-zinc-600">
                Xem nhanh ổn trên mobile, nhưng thao tác quản trị sâu vẫn nên làm trên desktop.
              </div>
            </div>
            <div className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              Compact
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
