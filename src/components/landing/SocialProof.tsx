"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Users, Utensils, Zap } from "lucide-react";

const stats = [
  { icon: Users, value: "1.200+", label: "người dùng hôm nay" },
  { icon: Utensils, value: "8.400+", label: "bữa ăn đã ghi" },
  { icon: Zap, value: "< 2 giây", label: "thời gian phản hồi AI" },
];

export const SocialProof = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section ref={ref} className="relative z-10 py-6">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-3 gap-4 rounded-[24px] border border-primary/10 bg-white/80 px-6 py-5 shadow-sm backdrop-blur"
        >
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.1, duration: 0.45 }}
                className="flex flex-col items-center gap-1 text-center"
              >
                <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Risk reversal strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground"
        >
          <span>✓ Miễn phí 7 ngày</span>
          <span>✓ Không cần thẻ tín dụng</span>
          <span>✓ Dùng được ngay trên Zalo / Telegram</span>
          <span>✓ Kích hoạt tự động 24/7</span>
        </motion.div>
      </div>
    </section>
  );
};
