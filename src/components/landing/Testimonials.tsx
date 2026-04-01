"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { TrendingDown, Scale, Dumbbell } from "lucide-react";

const testimonials = [
  {
    icon: TrendingDown,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    name: "Ngọc Hân",
    handle: "@ngochan_tphcm",
    before: "78 kg",
    after: "73.5 kg",
    duration: "6 tuần",
    quote:
      "Trước giờ tôi không bao giờ nhớ được mình ăn bao nhiêu. Giờ chỉ cần chụp ảnh gửi Zalo là xong. 6 tuần giảm 4.5kg mà không ăn kiêng khổ sở gì cả.",
    platform: "Zalo",
    platformColor: "#0068FF",
  },
  {
    icon: Scale,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-50",
    name: "Minh Tuấn",
    handle: "@minhtuan_gym",
    before: "65 kg",
    after: "68.2 kg",
    duration: "8 tuần",
    positive: true,
    quote:
      "Mục tiêu tôi là tăng cơ. Gym mode giúp AI hiểu tôi cần ăn nhiều hơn vào ngày tập. Tăng được 3.2kg trong 2 tháng và mỡ không tăng theo!",
    platform: "Telegram",
    platformColor: "#229ED9",
  },
  {
    icon: Dumbbell,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    name: "Thu Thảo",
    handle: "@thuthao_healthy",
    before: "61 kg",
    after: "59 kg",
    duration: "4 tuần",
    quote:
      "Tôi đã thử nhiều app nhưng hay bỏ cuộc vì phức tạp. CaloTrack thì khác — cứ chat bình thường trên Telegram là nó lo hết. 4 tuần giảm được 2kg.",
    platform: "Telegram",
    platformColor: "#229ED9",
  },
];

export const Testimonials = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Người dùng thật
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            Kết quả thật từ người dùng{" "}
            <span className="text-gradient-primary">CaloTrack</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Không ăn kiêng khổ sở — chỉ cần track đúng và nhất quán.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 24 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.12 + i * 0.12, duration: 0.5 }}
                className="flex flex-col rounded-[24px] border border-border bg-white p-6 shadow-sm"
              >
                {/* Before/After badge */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.iconBg}`}>
                      <Icon className={`h-4.5 w-4.5 ${t.iconColor}`} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.handle}</div>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: t.platformColor }}
                  >
                    {t.platform}
                  </span>
                </div>

                {/* Weight change */}
                <div className="mb-4 flex items-center gap-2 rounded-2xl bg-muted/40 px-4 py-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Trước</div>
                    <div className="text-lg font-bold text-foreground">{t.before}</div>
                  </div>
                  <div className="flex-1 text-center text-xl text-muted-foreground">→</div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Sau</div>
                    <div className={`text-lg font-bold ${t.positive ? "text-emerald-600" : "text-primary"}`}>
                      {t.after}
                    </div>
                  </div>
                  <div className="text-center ml-1">
                    <div className="text-xs text-muted-foreground">Thời gian</div>
                    <div className="text-sm font-semibold text-foreground">{t.duration}</div>
                  </div>
                </div>

                {/* Quote */}
                <p className="flex-1 text-sm leading-6 text-muted-foreground italic">
                  "{t.quote}"
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          * Kết quả mang tính cá nhân và có thể khác nhau tùy theo chế độ ăn và vận động.
        </p>
      </div>
    </section>
  );
};
