"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  MessageSquare,
  Sparkles,
  Trophy,
  Smartphone,
  PieChart,
  Shield,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Chat-first Hybrid",
    description:
      "Gửi ảnh hoặc tin nhắn qua Zalo, Telegram, Messenger. Không cần tải app riêng.",
    highlight: "Zalo-first",
  },
  {
    icon: Sparkles,
    title: "AI Hiểu Món Việt",
    description:
      "Nhận diện chính xác phở, bún bò, bánh mì... và hàng trăm món ăn Việt Nam phổ biến.",
    highlight: "Món Việt",
  },
  {
    icon: Trophy,
    title: "Gamification Nhẹ Nhàng",
    description:
      "Streak hàng ngày, huy hiệu thành tích — tạo động lực mà không gây áp lực.",
    highlight: "Streak & Badge",
  },
  {
    icon: PieChart,
    title: "Dashboard Chuyên Sâu",
    description:
      "Deficit ring, macro breakdown, trend chart — mọi số liệu bạn cần để theo dõi tiến độ.",
    highlight: "Pro Dashboard",
  },
  {
    icon: Smartphone,
    title: "Đồng Bộ Đa Nền Tảng",
    description:
      "Log từ chat, xem báo cáo trên web. Mọi dữ liệu sync realtime.",
    highlight: "Sync",
  },
  {
    icon: Shield,
    title: "An Toàn & Riêng Tư",
    description:
      "Dữ liệu được mã hóa, không chia sẻ với bên thứ ba. Bạn hoàn toàn kiểm soát.",
    highlight: "Privacy",
  },
];

export const Features = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section ref={containerRef} id="features" className="section-padding bg-mesh">
      <div className="container-wide mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 md:mb-20"
        >
          <p className="tagline mb-4">Lệnh nhanh chóng</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Sản phẩm thật,{" "}
            <span className="text-gradient-flame">tính năng thật</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Đủ đơn giản để dùng mỗi ngày, đủ sâu để theo dõi nghiêm túc
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group"
            >
              <div className="card-feature h-full">
                {/* Highlight badge */}
                <div className="inline-block mb-4">
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary">
                    {feature.highlight}
                  </span>
                </div>

                {/* Icon */}
                <div className="icon-box mb-5 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-teal" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
