"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Bell, CreditCard, MessageCircle, PieChart, Shield, Utensils } from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Chat-first tracking",
    description:
      "Bạn có thể log bữa ăn bằng chat, ảnh hoặc follow-up ngắn mà không bị ép đi qua một form quá nặng nề.",
  },
  {
    icon: Utensils,
    title: "AI hiểu món Việt",
    description:
      "CaloTrack được tối ưu để hiểu món Việt, đồ uống quen thuộc và các kiểu khẩu phần đời thường tốt hơn so với các cách track quá cơ học.",
  },
  {
    icon: PieChart,
    title: "Dashboard đọc nhanh",
    description:
      "Từ tổng nạp hôm nay đến recap tuần, dữ liệu được gom lại trong một giao diện dễ đọc và đủ sâu khi bạn cần xem kỹ.",
  },
  {
    icon: Bell,
    title: "Portal account + billing",
    description:
      "Website lo phần account, quota, plan, payment và support thay vì cố thay thế hoàn toàn luồng tracking trong chat.",
  },
  {
    icon: CreditCard,
    title: "Thanh toán hybrid thật",
    description:
      "Pricing, payment CTA và entitlement được trình bày đúng với trạng thái vận hành thật: có online path, có admin fallback khi cần.",
  },
  {
    icon: Shield,
    title: "Zalo-ready architecture",
    description:
      "Frontend, config và account surfaces đã được tổ chức quanh khái niệm channel để nối Zalo workflow riêng mà không phải đập lại UI.",
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
            Một frontend SaaS <span className="text-gradient-primary">đúng với product thật</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            CaloTrack không chỉ là landing page. Đây là lớp frontend cho acquisition, portal, pricing, admin
            và khả năng mở rộng sang Zalo mà vẫn giữ tracking chính theo mô hình chat-first.
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
