"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";

const rows = [
  {
    feature: "Nhập món ăn",
    old: "Tìm kiếm tay, 2–5 phút",
    calo: "Ảnh hoặc chat → AI → 3 giây",
    caloWin: true,
  },
  {
    feature: "Món ăn Việt",
    old: "Database thiếu, sai nhiều",
    calo: "Độ chính xác 95%, cập nhật liên tục",
    caloWin: true,
  },
  {
    feature: "Cần tải app",
    old: "Bắt buộc cài app riêng",
    calo: "Dùng ngay trên Zalo / Telegram",
    caloWin: true,
  },
  {
    feature: "Gym Coach AI",
    old: "Không có",
    calo: "Có — bật /gym on là dùng ngay",
    caloWin: true,
  },
  {
    feature: "Kích hoạt",
    old: "Thủ công, chờ admin",
    calo: "Tự động 24/7 sau chuyển khoản",
    caloWin: true,
  },
];

export const ComparisonTable = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            So sánh
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            Tại sao chọn{" "}
            <span className="text-gradient-primary">CaloTrack?</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Không cần app mới, không học giao diện phức tạp — chỉ cần chat như bình thường.
          </p>
        </motion.div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-[24px] border border-border shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-3 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            <div>Tính năng</div>
            <div className="text-center">App truyền thống</div>
            <div className="text-center text-primary">CaloTrack</div>
          </div>

          {rows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -12 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
              className={`grid grid-cols-3 items-start gap-2 px-4 py-4 text-sm ${
                i % 2 === 0 ? "bg-white" : "bg-muted/20"
              } border-t border-border`}
            >
              <div className="font-semibold text-foreground">{row.feature}</div>
              <div className="flex items-start gap-1.5 text-center text-muted-foreground">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive/60" />
                <span>{row.old}</span>
              </div>
              <div className="flex items-start gap-1.5 text-center font-medium text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{row.calo}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
