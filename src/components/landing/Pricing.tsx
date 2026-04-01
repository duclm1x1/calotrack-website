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
import { getPrimaryChannelHref } from "@/lib/siteConfig";

const plans = [
  {
    name: "Free",
    price: 0,
    period: "7 ngày",
    description: "Bắt đầu miễn phí để làm quen với việc theo dõi bữa ăn nhanh chóng trong 7 ngày đầu.",
    icon: Clock3,
    features: [
      "Trải nghiệm AI miễn phí trong 7 ngày",
      "Giới hạn 2 lượt phân tích ảnh mỗi ngày",
      "Giới hạn 5 lượt tin nhắn mỗi ngày",
    ],
    cta: "Bắt đầu Chat ngay",
    href: getPrimaryChannelHref(),
    external: true,
    popular: false,
  },
  {
    name: "Pro Tháng",
    price: BILLING_OFFERS.monthly.priceVnd,
    period: "/ tháng",
    description: "Nâng cấp trải nghiệm toàn diện và mở khóa toàn bộ tính năng hữu ích.",
    icon: Crown,
    features: [
      "Theo dõi bữa ăn qua chat",
      "Xem thống kê ngày / tuần / tháng",
      "Cập nhật cân nặng và tiến độ",
      "Gym mode và coach chuyên sâu",
      "Lịch sử đầy đủ",
      "Ưu tiên xử lý và trải nghiệm mượt hơn",
    ],
    cta: getBillingCheckoutLabel("monthly"),
    href: "/checkout?sku=monthly",
    external: false,
    popular: true,
  },
  {
    name: "Pro Năm",
    price: BILLING_OFFERS.yearly.priceVnd,
    period: "/ năm",
    description: "Tiết kiệm tối đa cho hành trình duy trì vóc dáng dài vợi của bạn.",
    icon: Crown,
    features: [
      "Bao gồm toàn bộ tính năng của Pro",
      "Tiết kiệm hơn so với thanh toán theo tháng",
      "Phù hợp nếu bạn muốn theo dõi nghiêm túc và lâu dài",
    ],
    cta: "Chọn Pro năm",
    href: "/checkout?sku=yearly",
    external: false,
    popular: false,
    badge: "Giá ưu đãi nhất",
  },
  {
    name: "Lifetime",
    price: BILLING_OFFERS.lifetime.priceVnd,
    period: "một lần",
    description: "Dành cho người vào sớm. Quyền lợi Lifetime không mở bán đại trà lâu dài.",
    icon: Gem,
    badge: "Chỉ 50 slot",
    features: [
      "Thanh toán duy nhất một lần",
      "Mở khóa vĩnh viễn mọi chức năng",
      "Hưởng ưu đãi cho tính năng AI mới",
    ],
    cta: "Xem Lifetime",
    href: "/checkout?sku=lifetime",
    external: false,
    popular: false,
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

        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
          className="rounded-[20px] border border-primary/10 bg-white/80 px-6 py-4 text-center shadow-sm backdrop-blur"
        >
          <div className="mb-2 text-sm font-semibold text-foreground">⚡ Kích hoạt tự động 24/7</div>
          <p className="text-xs text-muted-foreground">
            Chuyển khoản đúng nội dung → SePay phát hiện → hệ thống kích hoạt gói ngay, không cần chờ admin.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>✓ Miễn phí 7 ngày thử</span>
            <span>✓ Không cần thẻ tín dụng</span>
            <span>✓ Chuyển khoản VietinBank</span>
            <span>✓ {getBillingProviderSummary()}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
