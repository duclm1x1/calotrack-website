"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { MessageCircle, PieChart, Shield, Utensils } from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Theo dõi bữa ăn qua chat",
    description: "Gửi món ăn bằng text hoặc ảnh. Không cần ghi log thủ công như các app truyền thống.",
  },
  {
    icon: PieChart,
    title: "Xem thống kê ngày / tuần / tháng",
    description: "Biết hôm nay ăn bao nhiêu. Quản lý tổng quan tiến độ tuần này đang lệch hay đúng mục tiêu.",
  },
  {
    icon: Shield,
    title: "Cập nhật cân nặng và tiến độ",
    description: "Theo dõi cân nặng liên tục. Nhìn được xu hướng dài hạn thay vì chỉ tập trung vào từng ngày.",
  },
  {
    icon: Utensils,
    title: "Gym mode và coach chuyên sâu",
    description: "Dùng khi bắt đầu buổi tập hoặc cần hỏi nhiều hơn về tập luyện để nhận hướng dẫn theo ngữ cảnh.",
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
          <p className="tagline mb-3 justify-center">Lợi ích thực tế</p>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            CaloTrack <span className="text-gradient-primary">giúp gì cho bạn?</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Thiết kế đơn giản, tập trung vào kết quả thay vì thao tác rườm rà.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-6 md:gap-8 md:grid-cols-2">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative overflow-hidden group rounded-3xl p-8 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/40 dark:border-zinc-800/50 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.15)] transition-all duration-500 hover:-translate-y-2"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative z-10">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-primary/20 transition-all duration-500 group-hover:bg-primary/20 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_20px_hsla(var(--primary)/0.3)]">
                    <Icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{benefit.title}</h3>
                  <p className="text-base leading-relaxed text-muted-foreground">{benefit.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
