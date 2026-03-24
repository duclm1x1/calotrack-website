"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Clock, Crown, Gem } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BILLING_OFFERS } from "@/lib/billing";
import { formatVnd, SITE_CONFIG } from "@/lib/siteConfig";

const plans = [
  {
    name: "Free",
    price: "0đ",
    period: "/bat dau",
    description: "Phu hop de bat dau voi bot va test logging / stats tren Telegram.",
    icon: Clock,
    features: [
      `Toi da ${SITE_CONFIG.freeDailyLimit} luot AI/ngay`,
      "Log mon bang text, image va follow-up context co ban",
      "Mode, clear, stats va onboarding day du",
    ],
    cta: "Dung thu tren Telegram",
    popular: false,
  },
  {
    name: "Pro",
    price: formatVnd(BILLING_OFFERS.monthly.priceVnd),
    period: "/thang",
    description: "Goi chinh cho nguoi dung ca nhan can dung bot hang ngay.",
    icon: Crown,
    features: [
      "Han muc AI cao hon hoac khong gioi han theo chinh sach fair-use",
      "Phan tich anh mon an va follow-up context uu tien hon",
      "Tu dong kich hoat sau thanh toan + admin fallback khi webhook loi",
    ],
    cta: "Nhan link thanh toan",
    popular: true,
    note: "Co the ban theo week / month / quarter / year, nhung entitlement tier van la Pro.",
  },
  {
    name: "Lifetime",
    price: formatVnd(BILLING_OFFERS.lifetime.priceVnd),
    period: "/1 lan",
    description: "Danh cho nguoi dung dai han muon co mot tier on dinh ve entitlement.",
    icon: Gem,
    features: [
      "Tier Lifetime khong phu thuoc chu ky gia han",
      "Uu tien nhan cap nhat AI va tinh nang khach hang tra phi",
      "Phu hop neu ban dung bot la kenh theo doi dinh duong chinh",
    ],
    cta: "Trao doi goi Lifetime",
    popular: false,
    badge: "Best value",
  },
];

export const Pricing = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="pricing" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Chon goi <span className="text-gradient-primary">phu hop</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Gia tren web la lop acquisition va billing. Entitlement production duoc cap
            tren bot, khong dua vao mot customer portal phuc tap o v1.
          </p>
        </motion.div>

        <div className="mb-8 grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative rounded-2xl p-6 transition-all hover:-translate-y-1 ${
                  plan.popular
                    ? "scale-[1.02] bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-elegant"
                    : "card-base hover:shadow-elegant"
                }`}
              >
                {(plan.popular || plan.badge) && (
                  <div
                    className={`absolute left-1/2 top-[-0.75rem] -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold ${
                      plan.popular ? "bg-flame text-white" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {plan.popular ? "Pho bien nhat" : plan.badge}
                  </div>
                )}

                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
                    plan.popular ? "bg-white/20" : "bg-primary/10"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${plan.popular ? "text-white" : "text-primary"}`} />
                </div>

                <h3 className={`mb-1 text-xl font-bold ${plan.popular ? "text-white" : "text-foreground"}`}>
                  {plan.name}
                </h3>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${plan.popular ? "text-white" : "text-foreground"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.popular ? "text-white/70" : "text-muted-foreground"}`}>
                    {plan.period}
                  </span>
                </div>
                <p className={`mb-4 text-sm ${plan.popular ? "text-white/80" : "text-muted-foreground"}`}>
                  {plan.description}
                </p>

                <ul className="mb-6 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${plan.popular ? "text-white" : "text-primary"}`} />
                      <span className={plan.popular ? "text-white/90" : "text-muted-foreground"}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.note && (
                  <p className={`mb-4 text-xs ${plan.popular ? "text-white/80" : "text-muted-foreground"}`}>
                    {plan.note}
                  </p>
                )}

                <Button
                  className={`w-full ${plan.popular ? "bg-white text-primary hover:bg-white/90" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                  asChild
                >
                  <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                    {plan.cta}
                  </a>
                </Button>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.8 }}
          className="space-y-2 text-center"
        >
          <p className="text-xs text-muted-foreground">
            Payment flow v1 la hybrid: thanh toan online, kich hoat tu dong, va co admin fallback neu webhook bi loi.
          </p>
          <p className="text-xs text-muted-foreground">
            CaloTrack khong thay the tu van y khoa / dinh duong. Website hien tai khong phai customer dashboard day du.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <span className="text-xs text-muted-foreground">Thanh toan du kien:</span>
            <div className="flex items-center gap-3">
              <span className="rounded bg-muted px-3 py-1 text-xs font-medium">PayOS</span>
              <span className="rounded bg-muted px-3 py-1 text-xs font-medium">SePay</span>
              <span className="rounded bg-muted px-3 py-1 text-xs font-medium">Bank transfer</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
