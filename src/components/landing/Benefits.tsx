"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  MessageCircle,
  Utensils,
  PieChart,
  Bell,
  BarChart3,
  Shield,
} from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Chat-first Hybrid",
    description:
      "Nhập liệu bằng chat nhanh hơn mở app. Gửi ảnh/nhắn 1 câu là xong.",
  },
  {
    icon: Utensils,
    title: "FoodAI món Việt + khẩu phần",
    description:
      "Nhận diện món Việt và ước lượng khẩu phần sát thực tế. Bạn luôn có thể xác nhận/sửa nhanh.",
  },
  {
    icon: PieChart,
    title: "Còn lại hôm nay",
    description:
      "Chỉ cần hỏi \"còn lại?\" để biết ngân sách kcal trong ngày, bám đúng deficit/anabolic.",
  },
  {
    icon: Bell,
    title: "Tổng kết 21:00 + nhắc nhẹ",
    description:
      "Cuối ngày CaloTrack tổng kết kcal/macro và nhắc nhẹ đúng thói quen — không spam.",
  },
  {
    icon: BarChart3,
    title: "Báo cáo tuần/tháng",
    description:
      "Tổng kcal, xu hướng cân nặng, mức độ tuân thủ mục tiêu theo tuần/tháng.",
  },
  {
    icon: Shield,
    title: "Riêng tư & bảo mật",
    description:
      "Dữ liệu lưu trong hệ thống riêng; bạn có thể xóa dữ liệu theo yêu cầu bất cứ lúc nào.",
  },
];

export const Benefits = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="benefits" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Theo dõi dinh dưỡng{" "}
            <span className="text-gradient-primary">"không cần mở app"</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card-base p-6 group hover:shadow-elegant transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
