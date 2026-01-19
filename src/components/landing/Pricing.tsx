import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Zap, Crown, Infinity } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "0đ",
    period: "mãi mãi",
    description: "Dùng thử không giới hạn thời gian",
    icon: Zap,
    features: [
      "3 ảnh/ngày",
      "Theo dõi calo cơ bản",
      "Streak & badge",
      "Hỗ trợ qua chat",
    ],
    cta: "Bắt đầu miễn phí",
    popular: false,
    gradient: false,
  },
  {
    name: "Pro",
    price: "99.000đ",
    period: "/tháng",
    description: "Dành cho người nghiêm túc với mục tiêu",
    icon: Crown,
    features: [
      "Ảnh không giới hạn",
      "Dashboard chuyên sâu",
      "Macro breakdown chi tiết",
      "Export báo cáo PDF",
      "Insight AI cá nhân hóa",
      "Ưu tiên hỗ trợ",
    ],
    cta: "Nâng cấp Pro",
    popular: true,
    gradient: true,
  },
  {
    name: "Lifetime",
    price: "990.000đ",
    period: "một lần",
    description: "Trả một lần, dùng vĩnh viễn",
    icon: Infinity,
    features: [
      "Tất cả tính năng Pro",
      "Không phí hàng tháng",
      "Tính năng mới miễn phí",
      "Hỗ trợ VIP 1-1",
      "Badge đặc biệt",
    ],
    cta: "Mua Lifetime",
    popular: false,
    gradient: false,
  },
];

export const Pricing = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section ref={containerRef} id="pricing" className="section-padding bg-mesh">
      <div className="container-wide mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="tagline mb-4">Bảng giá</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Chọn gói phù hợp{" "}
            <span className="text-gradient-flame">với bạn</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Bắt đầu miễn phí, nâng cấp khi bạn sẵn sàng. Hỗ trợ VietQR &
            chuyển khoản ngân hàng.
          </p>
        </motion.div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className={`relative ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <span className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-flame-start to-flame-end text-white shadow-glow-flame">
                    Phổ biến nhất
                  </span>
                </div>
              )}

              <div
                className={`relative h-full rounded-3xl p-8 transition-all duration-300 hover:-translate-y-2 ${
                  plan.gradient
                    ? "bg-gradient-to-br from-teal to-teal-dark text-white shadow-glow-teal"
                    : "bg-card border border-border shadow-sm hover:shadow-lg"
                }`}
              >
                {/* Icon & Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      plan.gradient ? "bg-white/20" : "bg-primary/10"
                    }`}
                  >
                    <plan.icon
                      className={`w-5 h-5 ${
                        plan.gradient ? "text-white" : "text-primary"
                      }`}
                    />
                  </div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span
                    className={`text-sm ${
                      plan.gradient ? "text-white/80" : "text-muted-foreground"
                    }`}
                  >
                    {plan.period}
                  </span>
                </div>

                {/* Description */}
                <p
                  className={`text-sm mb-6 ${
                    plan.gradient ? "text-white/80" : "text-muted-foreground"
                  }`}
                >
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                          plan.gradient ? "text-white" : "text-teal"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          plan.gradient ? "text-white/90" : ""
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  className={`w-full py-3 px-6 rounded-xl font-medium transition-all duration-300 ${
                    plan.gradient
                      ? "bg-white text-teal-dark hover:bg-white/90"
                      : plan.popular
                      ? "btn-flame"
                      : "btn-secondary"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Payment methods */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Hỗ trợ thanh toán:{" "}
            <span className="font-medium text-foreground">
              VietQR • Chuyển khoản • Stripe
            </span>
          </p>
        </motion.div>
      </div>
    </section>
  );
};
