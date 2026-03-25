"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check, Clock, Crown, Gem } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BILLING_OFFERS } from "@/lib/billing";
import { formatVnd, SITE_CONFIG } from "@/lib/siteConfig";

const plans = [
  {
    name: "Free",
    price: "0đ",
    period: "mãi mãi",
    description:
      "Phù hợp để bắt đầu theo dõi bữa ăn, làm quen với chat flow và kiểm chứng xem CaloTrack có hợp với mình không.",
    icon: Clock,
    features: [
      `Tối đa ${SITE_CONFIG.freeDailyLimit} lượt AI mỗi ngày`,
      "Ghi món bằng text, ảnh và các follow-up cơ bản",
      "Xem thống kê hằng ngày và theo dõi tiến độ nền tảng",
    ],
    cta: "Bắt đầu miễn phí",
    popular: false,
  },
  {
    name: "Pro",
    price: formatVnd(BILLING_OFFERS.monthly.priceVnd),
    period: "/ tháng",
    description:
      "Gói chính dành cho người dùng thường xuyên muốn theo dõi bữa ăn mỗi ngày, dùng AI nhiều hơn và có trải nghiệm mượt hơn.",
    icon: Crown,
    features: [
      "Hạn mức AI cao hơn theo chính sách fair-use",
      "Ưu tiên các flow phân tích ảnh, search và follow-up nhiều bước",
      "Tự động kích hoạt sau thanh toán, có lớp admin fallback khi cần",
    ],
    cta: "Chọn gói Pro",
    popular: true,
    note: "Ngoài gói tháng, CaloTrack hiện còn có tùy chọn weekly, quarterly và yearly.",
  },
  {
    name: "Lifetime",
    price: formatVnd(BILLING_OFFERS.lifetime.priceVnd),
    period: "một lần",
    description:
      "Dành cho người muốn dùng lâu dài với một entitlement ổn định và không phải bận tâm chuyện gia hạn định kỳ.",
    icon: Gem,
    features: [
      "Một lần thanh toán, không cần theo dõi chu kỳ gia hạn",
      "Ưu tiên nhận các cải tiến dành cho khách hàng trả phí",
      "Phù hợp nếu CaloTrack là trợ lý dinh dưỡng bạn dùng hằng ngày",
    ],
    cta: "Mở Lifetime",
    popular: false,
    badge: "Giá trị dài hạn",
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
            Bảng giá <span className="text-gradient-primary">đơn giản, rõ ràng</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Bắt đầu miễn phí, nâng cấp khi cần. CaloTrack ưu tiên trải nghiệm dùng thật trước,
            rồi mới mở rộng dần các lớp billing và portal xung quanh.
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
          <p className="text-xs text-muted-foreground">Hỗ trợ thanh toán: VietQR • Chuyển khoản • Stripe</p>
          <p className="text-xs text-muted-foreground">
            Nếu bạn cần gói phù hợp hơn cho tần suất sử dụng của mình, đội ngũ CaloTrack có thể hỗ trợ thêm qua email hoặc admin flow.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
