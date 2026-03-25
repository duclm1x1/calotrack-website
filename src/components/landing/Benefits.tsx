"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, Bell, MessageCircle, PieChart, Shield, Utensils } from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Chat-first Hybrid",
    description:
      "Bạn có thể log bữa ăn bằng chat, ảnh hoặc follow-up ngắn mà không bị ép đi qua một form quá nặng nề.",
  },
  {
    icon: Utensils,
    title: "AI Hiểu Món Việt",
    description:
      "CaloTrack được tối ưu để hiểu món Việt, đồ uống quen thuộc và các kiểu khẩu phần đời thường tốt hơn so với những cách track quá cơ học.",
  },
  {
    icon: PieChart,
    title: "Gamification Nhẹ Nhàng",
    description:
      "Theo dõi tiến độ bằng những mốc rõ ràng và gợi ý vừa đủ, thay vì tạo cảm giác đang bị chấm điểm từng bữa ăn.",
  },
  {
    icon: Bell,
    title: "Dashboard Chuyên Sâu",
    description:
      "Từ tổng nạp hôm nay cho tới recap tuần, dữ liệu được gom lại trong một giao diện dễ đọc, hữu ích và đủ sâu khi bạn muốn xem kỹ.",
  },
  {
    icon: BarChart3,
    title: "Đồng Bộ Đa Nền Tảng",
    description:
      "Sản phẩm được định hướng theo mô hình chat-first đa kênh, với lớp website hỗ trợ cho acquisition, billing, dashboard và vận hành.",
  },
  {
    icon: Shield,
    title: "An Toàn & Riêng Tư",
    description:
      "Dữ liệu được tổ chức có cấu trúc để vừa phục vụ trải nghiệm người dùng, vừa hỗ trợ lớp admin và khả năng mở rộng dài hạn.",
  },
];

export const Benefits = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Mọi thứ bạn cần để <span className="text-gradient-primary">làm chủ bữa ăn</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Từ log nhanh, phân tích ảnh, theo dõi macro cho tới dashboard và lớp vận hành,
            CaloTrack được thiết kế như một hệ thống đủ gọn để dùng hằng ngày nhưng vẫn đủ sâu để phát triển.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card-base group p-6 transition-all hover:-translate-y-1 hover:shadow-elegant"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{benefit.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
