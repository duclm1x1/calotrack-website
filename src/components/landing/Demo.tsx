"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowUpRight, Bot, CalendarDays, Flame, PieChart, User } from "lucide-react";

import { Button } from "@/components/ui/button";

const chatMessages = [
  {
    type: "user",
    content: "[gửi ảnh bữa trưa]",
    isImage: true,
  },
  {
    type: "bot",
    content: "Khoảng 620 kcal | P 34g • C 72g • F 20g\nBạn còn khoảng 580 kcal để giữ mục tiêu hôm nay.",
    isImage: false,
  },
  {
    type: "user",
    content: "Còn lại hôm nay bao nhiêu?",
    isImage: false,
  },
  {
    type: "bot",
    content: "Khoảng 580 kcal. Nếu ăn tối nhẹ, bạn có thể ưu tiên protein nạc và thêm rau để no lâu hơn.",
    isImage: false,
  },
];

const dashboardCards = [
  { icon: Flame, label: "Đã nạp hôm nay", value: "1.420 kcal" },
  { icon: PieChart, label: "Protein", value: "96g / 120g" },
  { icon: CalendarDays, label: "Tiến độ tuần", value: "5/7 ngày đã log" },
];

export const Demo = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="demo" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Xem <span className="text-gradient-primary">demo Dashboard</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Từ chat flow hằng ngày tới lớp tổng hợp số liệu, CaloTrack giúp bạn nhìn nhanh
            hôm nay đã ăn gì, còn lại bao nhiêu và tuần này đang đi đúng hướng ra sao.
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="overflow-hidden rounded-3xl border border-border bg-background shadow-elegant"
          >
            <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">CaloTrack</h3>
                <p className="text-xs text-muted-foreground">AI nutrition assistant trong khung chat</p>
              </div>
            </div>

            <div className="min-h-[400px] space-y-4 p-4">
              {chatMessages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.3 }}
                  className={`flex items-end gap-2 ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.type === "bot" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.type === "user"
                        ? "bg-[#0068FF] text-white rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {message.isImage ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-amber-200 to-orange-300 text-2xl">
                          🍱
                        </div>
                        <span className="text-sm opacity-80">Ảnh bữa trưa</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line text-sm">{message.content}</p>
                    )}
                  </div>
                  {message.type === "user" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#0068FF]/20">
                      <User className="h-4 w-4 text-[#0068FF]" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <div className="border-t border-border p-4">
              <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-3">
                <span className="text-sm text-muted-foreground">Nhập tin nhắn...</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="rounded-3xl border border-border bg-background p-6 shadow-elegant"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Dashboard tổng quan</p>
                <h3 className="text-2xl font-bold text-foreground">Theo dõi rõ hơn mỗi ngày</h3>
              </div>
              <Button variant="outline" asChild>
                <a href="/login">
                  Mở portal
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {dashboardCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-border bg-muted/40 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{card.value}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5">
              <p className="text-sm text-muted-foreground">Tóm tắt tuần này</p>
              <div className="mt-4 flex items-end gap-3">
                {[56, 88, 72, 94, 68, 81, 77].map((height, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-xl bg-gradient-to-t from-primary to-flame"
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][index]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Demo mô phỏng giao diện tổng hợp. Bản production có thể khác tùy dữ liệu, quyền truy cập và trạng thái tính năng.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
