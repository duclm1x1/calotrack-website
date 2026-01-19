"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Zap, Crown, Gem, Clock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  { name: "Day Pass", price: "15.000đ", period: "/ngày", description: "Dùng nhanh khi cần \"quay lại kỷ luật\".", icon: Clock, features: ["AI phân tích ảnh", "Theo dõi kcal/macro", "Còn lại hôm nay"], cta: "Mua Day Pass", popular: false },
  { name: "Weekly", price: "49.000đ", period: "/tuần", description: "Hợp để thử nghiêm túc 7 ngày.", icon: Zap, features: ["AI phân tích ảnh", "Theo dõi kcal/macro", "Còn lại hôm nay", "Tổng kết hàng ngày"], cta: "Mua Weekly", popular: false },
  { name: "Monthly", price: "89.000đ", period: "/tháng", description: "AI ảnh + macro + gợi ý bữa + báo cáo nâng cao.", icon: Crown, features: ["AI phân tích ảnh không giới hạn", "Theo dõi kcal/macro chi tiết", "Còn lại hôm nay + gợi ý bữa", "Tổng kết 21:00 hàng ngày", "Báo cáo tuần/tháng", "Ưu tiên hỗ trợ"], cta: "Nâng cấp Monthly", popular: true },
  { name: "Yearly", price: "799.000đ", period: "/năm", description: "Tiết kiệm ~25% so với trả theo tháng (~66.000đ/tháng).", icon: Gem, features: ["Tất cả tính năng Monthly", "Tiết kiệm 25%", "Ưu tiên tính năng mới", "Hỗ trợ VIP"], cta: "Nâng cấp Yearly", popular: false, badge: "Best value" },
  { name: "Lifetime", price: "1.899.000đ", period: "", description: "Mở theo đợt. Phù hợp nếu bạn muốn dùng lâu dài.", icon: Bell, features: ["Tất cả tính năng Pro", "Truy cập vĩnh viễn", "Mọi cập nhật tương lai", "Limited slots"], cta: "Nhận thông báo đợt mở", popular: false, badge: "Limited drop", disabled: true },
];

export const Pricing = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="pricing" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Chọn gói <span className="text-gradient-primary">phù hợp</span></h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: index * 0.1 }} className={`relative rounded-2xl p-6 transition-all hover:-translate-y-1 ${plan.popular ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-elegant scale-105" : "card-base hover:shadow-elegant"}`}>
                {(plan.popular || plan.badge) && <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold ${plan.popular ? "bg-flame text-white" : "bg-primary/20 text-primary"}`}>{plan.popular ? "Phổ biến nhất" : plan.badge}</div>}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${plan.popular ? "bg-white/20" : "bg-primary/10"}`}>
                  <Icon className={`w-6 h-6 ${plan.popular ? "text-white" : "text-primary"}`} />
                </div>
                <h3 className={`text-xl font-bold mb-1 ${plan.popular ? "text-white" : "text-foreground"}`}>{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-2xl font-bold ${plan.popular ? "text-white" : "text-foreground"}`}>{plan.price}</span>
                  {plan.period && <span className={`text-sm ${plan.popular ? "text-white/70" : "text-muted-foreground"}`}>{plan.period}</span>}
                </div>
                <p className={`text-sm mb-4 ${plan.popular ? "text-white/80" : "text-muted-foreground"}`}>{plan.description}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.popular ? "text-white" : "text-primary"}`} />
                      <span className={plan.popular ? "text-white/90" : "text-muted-foreground"}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button className={`w-full ${plan.popular ? "bg-white text-primary hover:bg-white/90" : plan.disabled ? "bg-muted text-muted-foreground" : ""}`} variant={plan.popular ? "default" : "outline"} disabled={plan.disabled}>{plan.cta}</Button>
              </motion.div>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={isInView ? { opacity: 1 } : {}} transition={{ delay: 0.8 }} className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">AI có thể sai — bạn luôn xác nhận/sửa trước khi lưu.</p>
          <p className="text-xs text-muted-foreground">CaloTrack không thay thế tư vấn y khoa/dinh dưỡng.</p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <span className="text-xs text-muted-foreground">Thanh toán:</span>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-muted rounded text-xs font-medium">VietQR</span>
              <span className="px-3 py-1 bg-muted rounded text-xs font-medium">Bank Transfer</span>
              <span className="px-3 py-1 bg-muted rounded text-xs font-medium">Stripe</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
