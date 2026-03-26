"use client";

import { motion } from "framer-motion";

import { SITE_CONFIG } from "@/lib/siteConfig";

const logoSquare = "/logo-square.jpg";

const footerGroups = [
  {
    title: "Sản phẩm",
    links: [
      { label: "Tính năng", href: "#features" },
      { label: "Cách hoạt động", href: "#how-it-works" },
      { label: "Bảng giá", href: "#pricing" },
    ],
  },
  {
    title: "Portal",
    links: [
      { label: "Đăng nhập", href: "/login" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Admin", href: "/admin" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Liên hệ", href: "#contact" },
      { label: SITE_CONFIG.supportEmail, href: `mailto:${SITE_CONFIG.supportEmail}` },
    ],
  },
];

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="container mx-auto px-4 py-10 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <motion.a href="/" whileHover={{ scale: 1.02 }} className="flex items-center gap-3">
              <img src={logoSquare} alt="CaloTrack" className="h-10 w-10 rounded-lg object-cover" />
              <div>
                <span className="text-lg font-bold text-foreground">CaloTrack</span>
                <p className="text-sm text-muted-foreground">{SITE_CONFIG.productStageLabel}</p>
              </div>
            </motion.a>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              CaloTrack là AI nutrition assistant theo hướng chat-first, với website đóng vai trò lớp SaaS cho
              pricing, portal, billing và admin backoffice.
            </p>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{group.title}</h3>
              <div className="mt-4 flex flex-col gap-3">
                {group.links.map((link) => (
                  <a key={link.label} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-primary/10 bg-white/80 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Channel truth</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div>Telegram: tracking live</div>
              <div>{SITE_CONFIG.secondaryChannelLabel}: {SITE_CONFIG.secondaryChannelStatus}</div>
              <div>{SITE_CONFIG.webPortalLabel}: account, billing và admin</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} CaloTrack. Made in Vietnam.</p>
          <p>Frontend canonical: Vite SPA. Layer chat đi trước, layer portal đi sau nhưng đồng bộ.</p>
        </div>
      </div>
    </footer>
  );
};
