"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, BrainCircuit, MessageCircle } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageCircle,
    title: "Chat như bình thường",
    description:
      "Gửi món ăn bằng văn bản, gửi ảnh bữa ăn thực tế, hoặc hỏi nhanh các câu hỏi dinh dưỡng.",
    color: "primary",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "Phân tích và Lưu lại",
    description:
      "Hệ thống AI tự động phân tích và lưu trữ bữa ăn, thống kê calo, lịch sử nạp và tiến độ.",
    color: "flame",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Theo dõi và điều chỉnh",
    description:
      "Dễ dàng xem dashboard tổng quan mỗi ngày, cập nhật cân nặng và bật Gym mode khi cần.",
    color: "primary",
  },
];

export const HowItWorks = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <p className="tagline mb-3 justify-center">Cách dùng</p>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Sử dụng cực kỳ <span className="text-gradient-primary">đơn giản</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Chỉ với 3 bước cơ bản, bạn đã có ngay một trợ lý dinh dưỡng cá nhân hoạt động liên tục 24/7 mà không cần mở bất kỳ ứng dụng thứ ba nào.
          </p>
        </motion.div>

        <div className="mb-12 grid gap-8 md:grid-cols-3 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="absolute left-[60%] top-16 hidden h-0.5 w-[80%] bg-gradient-to-r from-primary/30 to-transparent md:block" />
                )}
                <div className="card-base group p-8 text-center transition-shadow hover:shadow-elegant">
                  <div className="absolute left-1/2 top-[-0.75rem] -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-bold text-primary-foreground">
                    {step.number}
                  </div>
                  <div
                    className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${
                      step.color === "flame"
                        ? "bg-gradient-to-br from-flame-light to-flame"
                        : "bg-gradient-to-br from-primary/80 to-primary"
                    }`}
                  >
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
