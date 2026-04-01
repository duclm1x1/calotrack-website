"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check, Clock3, Crown, Gem } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  BILLING_OFFERS,
  formatBillingPriceVnd,
  getBillingCheckoutLabel,
  getBillingProviderSummary,
} from "@/lib/billing";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";

const plans = [
  {
    name: "Free",
    price: 0,
    period: "mãi mãi",
    description: "Bắt đầu miễn phí để dùng CaloTrack theo kiểu chat-first và làm quen với portal account.",
    icon: Clock3,
    features: [
      `Tối đa ${SITE_CONFIG.freeDailyLimit} lượt AI mỗi ngày`,
      "Gửi ảnh món ăn hoặc nhắn tên món để ước tính calories",
      "Xem account và portal cơ bản sau khi đăng nhập",
    ],
    cta: "Bắt đầu Chat ngay",
    href: getPrimaryChannelHref(),
    external: true,
    popular: false,
  },
  {
    name: "Pro",
    price: BILLING_OFFERS.monthly.priceVnd,
    period: "/ tháng",
    description: "Dành cho người dùng thường xuyên muốn tracking đều đặn và đi sâu hơn vào các flow AI.",
    icon: Crown,
    features: [
      "Ưu tiên hơn cho image review và follow-up nhiều bước",
      "Phù hợp để giữ nhịp track hàng ngày",
      "Đi vào portal để xem billing và entitlement rõ hơn",
    ],
    cta: getBillingCheckoutLabel("monthly"),
    href: "/checkout?plan=pro",
    external: false,
    popular: true,
  },
  {
    name: "Lifetime",
    price: BILLING_OFFERS.lifetime.priceVnd,
    period: "một lần",
    description: "Một lần thanh toán, dùng dài hạn nếu bạn muốn CaloTrack trở thành lớp nutrition support thường trực.",
    icon: Gem,
    features: [
      "Không cần theo dõi chu kỳ gia hạn",
      "Rõ entitlement dài hạn trong portal và admin",
      "Phù hợp nếu bạn gắn bó lâu dài với hệ thống",
    ],
    cta: getBillingCheckoutLabel("lifetime"),
    href: "/checkout?plan=lifetime",
    external: false,
    popular: false,
    badge: "Thanh toán một lần",
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
            Bảng giá <span className="text-gradient-primary">đi đúng với billing thật</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Giá hiển thị trên website đọc trực tiếp từ source of truth của frontend. Free, Pro và Lifetime
            được trình bày rõ để người dùng hiểu account layer, còn phần payment sẽ đi theo luồng portal hoặc
            hỗ trợ phù hợp với channel đang dùng.
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
                      plan.popular ? "bg-accent text-white" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {plan.popular ? "Phổ biến nhất" : plan.badge}
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
                    {formatBillingPriceVnd(plan.price)}
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

                <Button
                  className={`w-full ${plan.popular ? "bg-white text-primary hover:bg-white/90" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                  asChild
                >
                  <a
                    href={plan.href}
                    target={plan.external ? "_blank" : undefined}
                    rel={plan.external ? "noopener noreferrer" : undefined}
                  >
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
          <p className="text-xs text-muted-foreground">Hỗ trợ thanh toán: {getBillingProviderSummary()}</p>
          <p className="text-xs text-muted-foreground">
            Payment có thể đi qua portal hoặc được hỗ trợ theo channel đang dùng. Frontend chỉ hiển thị những
            gì backend và admin layer hiện thực sự support.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
