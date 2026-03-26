import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeDollarSign,
  Database,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Settings,
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
  customers: Users,
  channels: Link2,
  users: Users,
  payments: BadgeDollarSign,
  catalog: Database,
  support: LifeBuoy,
  system: Activity,
  settings: Settings,
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
  const isOwner = access?.isOwner === true;
  const items: AdminNavItem[] = [
    {
      key: "overview",
      label: "Tong quan",
      description: "KPI, channel mix va canh bao van hanh",
      icon: ICONS.overview,
      accent: "primary",
      badge: badges?.overview,
    },
    {
      key: "customers",
      label: "Customers",
      description: "Customer canonical linked by phone",
      icon: ICONS.customers,
      accent: "neutral",
      badge: badges?.customers ?? badges?.users,
      hidden: !(isOwner || roles.has("support") || roles.has("finance")),
    },
    {
      key: "channels",
      label: "Channels",
      description: "Telegram, Zalo, web-linked identities",
      icon: ICONS.channels,
      accent: "primary",
      badge: badges?.channels,
      hidden: !(isOwner || roles.has("support") || roles.has("finance")),
    },
    {
      key: "payments",
      label: "Payments",
      description: "Doanh thu, doi soat va grants",
      icon: ICONS.payments,
      accent: "accent",
      badge: badges?.payments,
      hidden: !(isOwner || roles.has("finance")),
    },
    {
      key: "catalog",
      label: "Catalog",
      description: "Foods, aliases, nutrition, portions",
      icon: ICONS.catalog,
      accent: "primary",
      badge: badges?.catalog,
      hidden: !(isOwner || roles.has("catalog")),
    },
    {
      key: "support",
      label: "Support",
      description: "Customer 360, notes, quota reset, repair",
      icon: ICONS.support,
      accent: "neutral",
      badge: badges?.support,
      hidden: !(isOwner || roles.has("support")),
    },
    {
      key: "system",
      label: "System",
      description: "Schema, health, webhook, audit",
      icon: ICONS.system,
      accent: "neutral",
      badge: badges?.system,
    },
    {
      key: "settings",
      label: "Settings",
      description: "Admin members, roles, readonly billing config",
      icon: ICONS.settings,
      accent: "accent",
      badge: badges?.settings,
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
          <h2 className="text-xl font-semibold text-foreground">Admin van hanh da kenh</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Telegram va Zalo la kenh van hanh chinh. Web giu vai tro portal account, billing va admin.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-primary">Teal Core</span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-accent">Flame Accent</span>
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
              <div className="text-sm text-zinc-600">Desktop hoac tablet se de van hanh hon.</div>
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
