"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check, Clock3, Crown, Gem } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG, formatVnd } from "@/lib/siteConfig";

const plans = [
  {
    name: "Free",
    price: 0,
    period: "mãi mãi",
    description: "Bắt đầu hoàn toàn miễn phí để làm quen với cách CaloTrack theo dõi bữa ăn trong chat.",
    icon: Clock3,
    features: [
      `Tối đa ${SITE_CONFIG.freeDailyLimit} lượt AI mỗi ngày`,
      "Gửi ảnh món ăn hoặc nhắn tên món để ước tính calories",
      "Xem tổng nạp trong ngày và những chỉ số cơ bản",
    ],
    cta: "Bắt đầu miễn phí",
    popular: false,
  },
  {
    name: "Pro",
    price: 99000,
    period: "/ tháng",
    description: "Dành cho người dùng thường xuyên muốn track bữa ăn mượt hơn và dùng AI nhiều hơn mỗi ngày.",
    icon: Crown,
    features: [
      "Ưu tiên trải nghiệm phân tích ảnh và follow-up nhiều bước",
      "Hạn mức AI cao hơn để theo dõi đều đặn mỗi ngày",
      "Phù hợp cho mục tiêu giảm mỡ, giữ cân hoặc tăng cơ",
    ],
    cta: "Chọn gói Pro",
    popular: true,
  },
  {
    name: "Lifetime",
    price: 990000,
    period: "một lần",
    description: "Một lần thanh toán, dùng lâu dài cho người muốn CaloTrack trở thành trợ lý dinh dưỡng hằng ngày.",
    icon: Gem,
    features: [
      "Không cần theo dõi chu kỳ gia hạn",
      "Trải nghiệm trả phí dài hạn với chi phí một lần",
      "Phù hợp nếu bạn muốn gắn bó lâu dài với hệ thống",
    ],
    cta: "Chọn Lifetime",
    popular: false,
    badge: "Tiết kiệm dài hạn",
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
            Chọn gói phù hợp với tần suất sử dụng của bạn. Bắt đầu miễn phí, nâng cấp khi đã thấy CaloTrack thực sự hữu ích trong đời sống hằng ngày.
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
                    {formatVnd(plan.price)}
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
            Nếu bạn cần hỗ trợ thêm về gói dịch vụ hoặc cách nâng cấp, đội ngũ CaloTrack có thể hỗ trợ qua email và admin flow.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
