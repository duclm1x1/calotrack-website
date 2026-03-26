"use client";

import { motion } from "framer-motion";
import { BadgeCheck, CreditCard, MessagesSquare, Workflow } from "lucide-react";

const items = [
  {
    icon: MessagesSquare,
    label: "Telegram-first",
    helper: "Tracking chat đang live và ổn định nhất",
    tone: "primary",
  },
  {
    icon: Workflow,
    label: "Zalo-ready",
    helper: "Frontend và account layer đã sẵn để nối workflow riêng",
    tone: "accent",
  },
  {
    icon: CreditCard,
    label: "Portal + Billing",
    helper: "Website lo pricing, account, payment và quyền truy cập",
    tone: "primary",
  },
  {
    icon: BadgeCheck,
    label: "Admin vận hành",
    helper: "Users, payments, catalog, support và audit trên cùng một backoffice",
    tone: "neutral",
  },
];

export const TrustStrip = () => {
  return (
    <section className="relative z-10 -mt-8 pb-4">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item, index) => {
            const Icon = item.icon;
            const toneClasses =
              item.tone === "accent"
                ? "border-accent/15 bg-white text-accent"
                : item.tone === "neutral"
                  ? "border-border bg-white text-foreground"
                  : "border-primary/10 bg-white text-primary";

            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.08, duration: 0.45 }}
                className={`rounded-[24px] border px-4 py-4 shadow-sm backdrop-blur ${toneClasses}`}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{item.label}</div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.helper}</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
