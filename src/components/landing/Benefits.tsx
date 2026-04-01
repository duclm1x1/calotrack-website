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

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
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
