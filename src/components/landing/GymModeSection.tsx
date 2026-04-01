"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Dumbbell, Brain, BarChart2, Zap } from "lucide-react";

const gymFeatures = [
  {
    icon: Zap,
    title: "Bật tức thì",
    desc: "Gõ /gym on — chế độ coach kích hoạt ngay trong 3 giờ, không cần setup gì thêm.",
  },
  {
    icon: Brain,
    title: "AI Coach theo ngữ cảnh",
    desc: "AI biết bạn ăn gì hôm nay, TDEE là bao nhiêu — coach dựa trên dữ liệu thật của bạn.",
  },
  {
    icon: BarChart2,
    title: "Điều chỉnh macro tự động",
    desc: "Khi gym mode bật, AI tự tính lại lượng Protein, Carb cần thiết cho ngày tập.",
  },
  {
    icon: Dumbbell,
    title: "Gợi ý buổi tập",
    desc: "/gym plan 45 → nhận ngay buổi tập 45 phút phù hợp theo mục tiêu giảm mỡ / tăng cơ.",
  },
];

const gymCommands = [
  { cmd: "/gym on", desc: "Bật specialist mode 3 giờ" },
  { cmd: "/gym plan 45", desc: "Nhận buổi tập gợi ý 45 phút" },
  { cmd: "/gym status", desc: "Xem thời gian còn lại" },
  { cmd: "/gym off", desc: "Tắt mode ngay khi xong" },
];

export const GymModeSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="section-padding bg-muted/20">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: copy */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Gym Mode
            </div>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Coach AI cho Workout —{" "}
              <span className="text-gradient-primary">không cần app riêng</span>
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Không app nào làm được điều này: AI biết chính xác bạn đã ăn gì hôm nay, TDEE của bạn
              là bao nhiêu — và coach dựa trên dữ liệu thật đó, không phải template chung chung.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {gymFeatures.map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <motion.div
                    key={feat.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.2 + i * 0.08, duration: 0.45 }}
                    className="rounded-2xl border border-border bg-white p-4 shadow-sm"
                  >
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                      <Icon className="h-4.5 w-4.5 text-emerald-600" />
                    </div>
                    <div className="font-semibold text-foreground">{feat.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{feat.desc}</div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right: mock terminal card */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-[28px] border border-border bg-slate-900 p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-2 text-xs text-slate-400">CaloTrack Gym Mode</span>
            </div>

            <div className="space-y-3">
              {gymCommands.map((item, i) => (
                <motion.div
                  key={item.cmd}
                  initial={{ opacity: 0, x: 10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
                  className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3"
                >
                  <code className="text-sm font-mono text-emerald-400">{item.cmd}</code>
                  <span className="text-xs text-slate-400">{item.desc}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 rounded-xl bg-emerald-900/40 border border-emerald-700/40 px-4 py-3">
              <p className="text-xs text-emerald-300 font-medium">
                💪 Gym Mode ON — còn 2 giờ 47 phút
              </p>
              <p className="mt-1 text-xs text-emerald-400/70">
                AI đang ở chế độ coach workout chuyên sâu
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
