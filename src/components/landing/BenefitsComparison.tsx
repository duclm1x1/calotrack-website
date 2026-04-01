"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { CheckCircle2, MessageCircle, PieChart, Shield, Utensils, XCircle } from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Theo dõi bữa ăn qua chat",
    description: "Gửi món ăn bằng text hoặc ảnh. Không cần ghi log thủ công như các app truyền thống.",
  },
  {
    icon: PieChart,
    title: "Xem thống kê ngày / tuần / tháng",
    description: "Biết hôm nay ăn bao nhiêu. Quản lý tiến độ tuần này đang lệch hay đúng mục tiêu.",
  },
  {
    icon: Shield,
    title: "Cập nhật cân nặng và tiến độ",
    description: "Theo dõi cân nặng liên tục. Nhìn xu hướng dài hạn thay vì chỉ tập trung từng ngày.",
  },
  {
    icon: Utensils,
    title: "Gym mode và coach chuyên sâu",
    description: "Dùng khi bắt đầu buổi tập hoặc cần hỏi về tập luyện để nhận hướng dẫn theo ngữ cảnh.",
  },
];

const tableRows = [
  {
    feature: "Nhập món ăn",
    traditional: "Tìm kiếm tay, 2–5 phút",
    calotrack: "Ảnh hoặc chat → AI → 3 giây",
  },
  {
    feature: "Món ăn Việt",
    traditional: "Database thiếu, sai nhiều",
    calotrack: "Độ chính xác 95%, cập nhật liên tục",
  },
  {
    feature: "Cần tải app",
    traditional: "Bắt buộc cài app riêng",
    calotrack: "Dùng ngay trên Zalo / Telegram",
  },
  {
    feature: "Gym Coach AI",
    traditional: "Không có",
    calotrack: "Có — bật /gym on là dùng ngay",
  },
  {
    feature: "Kích hoạt",
    traditional: "Thủ công, chờ admin",
    calotrack: "Tự động 24/7 sau chuyển khoản",
  },
];

export const BenefitsComparison = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="features" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Section header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <p className="tagline mb-3 justify-center">Lợi ích thực tế</p>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            CaloTrack <span className="text-gradient-primary">giúp gì cho bạn?</span>
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Thiết kế đơn giản, tập trung vào kết quả thay vì thao tác rườm rà.
          </p>
        </motion.div>

        {/* 2-1-2 Grid: benefit left | comparison center | benefit right */}
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.6fr_1fr]">
          {/* LEFT: 2 benefit cards */}
          <div className="flex flex-col gap-5">
            {benefits.slice(0, 2).map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, x: -30 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.12 }}
                  className="relative overflow-hidden group rounded-3xl p-6 bg-white/60 backdrop-blur-xl border border-white/40 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.13)] transition-all duration-500 hover:-translate-y-1"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-primary/20 group-hover:scale-110 transition-all duration-300">
                      <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{b.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* CENTER: Comparison table card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-3xl border border-primary/10 bg-white/90 backdrop-blur shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] overflow-hidden"
          >
            {/* Card header */}
            <div className="px-6 pt-6 pb-4 border-b border-muted/60 text-center">
              <p className="tagline mb-2 justify-center">So sánh</p>
              <h3 className="text-xl font-bold text-foreground">Tại sao chọn CaloTrack?</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Không cần app mới, không học giao diện phức tạp — chỉ cần chat như bình thường.
              </p>
            </div>

            {/* Table */}
            <div className="divide-y divide-muted/50">
              {/* Header row */}
              <div className="grid grid-cols-3 px-4 py-2.5 bg-muted/30">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tính năng</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground text-center">App truyền thống</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary text-center">CaloTrack</span>
              </div>

              {tableRows.map((row, i) => (
                <motion.div
                  key={row.feature}
                  initial={{ opacity: 0, x: 10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.07 }}
                  className="grid grid-cols-3 items-center gap-3 px-4 py-3.5 hover:bg-primary/[0.03] transition-colors"
                >
                  <span className="text-sm font-semibold text-foreground">{row.feature}</span>
                  <div className="flex items-start gap-1.5 justify-center">
                    <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                    <span className="text-xs text-muted-foreground leading-snug text-center">{row.traditional}</span>
                  </div>
                  <div className="flex items-start gap-1.5 justify-center">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-xs font-medium text-foreground leading-snug text-center">{row.calotrack}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* RIGHT: 2 benefit cards */}
          <div className="flex flex-col gap-5">
            {benefits.slice(2, 4).map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, x: 30 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.12 }}
                  className="relative overflow-hidden group rounded-3xl p-6 bg-white/60 backdrop-blur-xl border border-white/40 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.13)] transition-all duration-500 hover:-translate-y-1"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-primary/20 group-hover:scale-110 transition-all duration-300">
                      <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{b.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
