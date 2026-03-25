"use client";

import { motion } from "framer-motion";

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
    title: "Công ty",
    links: [
      { label: "Về CaloTrack", href: "#" },
      { label: "Portal", href: "/login" },
      { label: "Admin", href: "/admin" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Liên hệ", href: "#contact" },
      { label: "support@calotrack.vn", href: "mailto:support@calotrack.vn" },
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
                <p className="text-sm text-muted-foreground">AI Nutrition Assistant</p>
              </div>
            </motion.a>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              CaloTrack giúp bạn theo dõi bữa ăn, calories và macro theo cách tự nhiên hơn
              thông qua chat, AI và một lớp dashboard hỗ trợ rõ ràng.
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
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} CaloTrack. Made in Vietnam.</p>
          <p>Theo dõi bữa ăn thông minh, đơn giản và gần với đời sống hằng ngày.</p>
        </div>
      </div>
    </footer>
  );
};
