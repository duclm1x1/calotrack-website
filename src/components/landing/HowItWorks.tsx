"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { MessageSquare, Camera, PieChart } from "lucide-react";

const steps = [
  { number: "01", icon: MessageSquare, title: "Nhắn \"bắt đầu\"", description: "Nhắn \"bắt đầu\" trên Zalo/Telegram để chọn mục tiêu (giảm/giữ/tăng).", color: "primary" },
  { number: "02", icon: Camera, title: "Gửi ảnh hoặc nhập nhanh", description: "Gửi ảnh hoặc nhập nhanh: \"cơm tấm 250g\".", color: "flame" },
  { number: "03", icon: PieChart, title: "Nhận kết quả tự động", description: "CaloTrack tính kcal/macro, lưu tự động và trả \"còn lại hôm nay\".", color: "primary" },
];

const commands = ["cơm tấm 250g", "còn lại hôm nay", "cân nặng 70.5", "bật chi tiết", "tắt chi tiết"];

export const HowItWorks = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Chỉ <span className="text-gradient-primary">3 bước</span> là bắt đầu</h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 lg:gap-12 mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.number} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: index * 0.15 }} className="relative">
                {index < steps.length - 1 && <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/30 to-transparent" />}
                <div className="card-base p-8 text-center group hover:shadow-elegant transition-shadow">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-bold rounded-full">{step.number}</div>
                  <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${step.color === "flame" ? "bg-gradient-to-br from-flame-light to-flame" : "bg-gradient-to-br from-primary/80 to-primary"}`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.5 }} className="text-center">
          <p className="text-sm text-muted-foreground mb-4">Các lệnh nhanh:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {commands.map((cmd, index) => (
              <motion.span key={index} initial={{ opacity: 0, scale: 0.8 }} animate={isInView ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.6 + index * 0.1 }} className="px-4 py-2 bg-muted rounded-full text-sm font-mono text-foreground">{cmd}</motion.span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6 italic">Sai món? Bạn sửa nhanh 1/2/3 — hệ thống học dần khẩu vị của bạn.</p>
        </motion.div>
      </div>
    </section>
  );
};
