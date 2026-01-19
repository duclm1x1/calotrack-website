import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Camera, Brain, TrendingUp, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Chụp & Gửi",
    description:
      "Chỉ cần chụp ảnh bữa ăn hoặc nhắn tin mô tả — gửi qua Zalo, Telegram, hoặc Messenger.",
    color: "teal" as const,
  },
  {
    number: "02",
    icon: Brain,
    title: "AI Phân Tích",
    description:
      "AI thông minh nhận diện món ăn Việt, ước tính calo và macro (Protein, Carb, Fat) chỉ trong vài giây.",
    color: "flame" as const,
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Theo Dõi & Báo Cáo",
    description:
      "Dashboard cập nhật realtime, hiển thị deficit ring, streak, và insight cá nhân hóa mỗi ngày.",
    color: "teal" as const,
  },
];

export const HowItWorks = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      className="section-padding bg-gradient-section"
    >
      <div className="container-wide mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 md:mb-20"
        >
          <p className="tagline mb-4">Quy trình đơn giản</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Chỉ <span className="text-gradient-teal">3 bước</span> để kiểm soát calo
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Không cần app phức tạp, không cần nhập liệu thủ công. Mọi thứ diễn
            ra tự nhiên qua tin nhắn.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-teal via-flame to-teal opacity-20 -translate-y-1/2" />

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="relative group"
              >
                <div className="card-feature h-full relative overflow-hidden">
                  {/* Step number background */}
                  <div className="absolute top-4 right-4 text-7xl font-bold text-muted/50 select-none">
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div
                    className={`relative z-10 mb-6 ${
                      step.color === "teal" ? "icon-box" : "icon-box-flame"
                    }`}
                  >
                    <step.icon
                      className={`w-7 h-7 ${
                        step.color === "teal" ? "text-teal" : "text-flame"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="relative z-10">
                    <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Arrow for desktop */}
                  {index < steps.length - 1 && (
                    <div className="hidden lg:flex absolute -right-6 top-1/2 -translate-y-1/2 z-20">
                      <div className="w-12 h-12 rounded-full bg-card shadow-md flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  )}

                  {/* Hover gradient */}
                  <div
                    className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl ${
                      step.color === "teal"
                        ? "bg-gradient-to-br from-teal/5 to-transparent"
                        : "bg-gradient-to-br from-flame/5 to-transparent"
                    }`}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center mt-16"
        >
          <a href="#" className="btn-flame text-base py-4 px-8">
            Thử ngay — Hoàn toàn miễn phí
            <ArrowRight className="w-5 h-5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};
