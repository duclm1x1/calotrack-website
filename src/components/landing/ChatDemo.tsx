"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Image as ImageIcon, MessageCircle } from "lucide-react";

type ChatMsg =
  | { type: "user"; content: string; isImage?: boolean }
  | { type: "bot"; content: string; isImage?: never };

interface ChatExample {
  title: string;
  badge: string;
  badgeColor: string;
  messages: ChatMsg[];
}

const chatExamples: ChatExample[] = [
  {
    title: "Ghi bằng ảnh",
    badge: "AI phân tích ảnh",
    badgeColor: "text-blue-600 bg-blue-50",
    messages: [
      {
        type: "user" as const,
        content: "[Gửi ảnh bún bò Huế]",
        isImage: true,
      },
      {
        type: "bot" as const,
        content:
          "📸 Phân tích xong!\n\nBún bò Huế (~1 tô lớn)\n🔥 Calo: 520 kcal\n🥩 Protein: 28g • Carb: 68g • Fat: 14g\n\nĐã ghi vào bữa trưa. Hôm nay còn 890 kcal để đạt TDEE.",
      },
    ],
  },
  {
    title: "Hỏi tiến độ",
    badge: "Dashboard tức thời",
    badgeColor: "text-primary bg-primary/10",
    messages: [
      { type: "user" as const, content: "/stats" },
      {
        type: "bot" as const,
        content:
          "📊 Hôm nay — Thứ Tư\n\n🎯 1.420 / 2.471 kcal\n├ Protein 96g ✅\n├ Carb 130g ✅\n└ Fat 42g ✅\n\n🏃 Chạy bộ: −352 kcal\n💪 Còn lại: 699 kcal",
      },
    ],
  },
  {
    title: "Gym Mode",
    badge: "/gym on",
    badgeColor: "text-emerald-600 bg-emerald-50",
    messages: [
      { type: "user" as const, content: "/gym on" },
      {
        type: "bot" as const,
        content:
          "💪 Gym Mode bật — 3 giờ\n\nMình đang ở chế độ coach workout. Hỏi gì về bài tập, dinh dưỡng pre/post-workout mình trả lời ngay nhé!\n\n→ /gym plan 60 để nhận buổi tập gợi ý",
      },
    ],
  },
];

export const ChatDemo = () => {
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
            Demo Chat thật
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            Xem CaloTrack{" "}
            <span className="text-gradient-primary">hoạt động thế nào</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Gửi ảnh hoặc gõ lệnh như chat bình thường — AI phân tích và phản hồi ngay lập tức.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {chatExamples.map((example, i) => (
            <motion.div
              key={example.title}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
              className="flex flex-col rounded-[24px] border border-border bg-white shadow-sm overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <MessageCircle className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{example.title}</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${example.badgeColor}`}>
                  {example.badge}
                </span>
              </div>

              {/* Chat messages */}
              <div className="flex flex-1 flex-col gap-3 p-4">
                {example.messages.map((msg, mi) => (
                  <div
                    key={mi}
                    className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.type === "bot" && (
                      <div className="mr-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                        C
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-[1.6] whitespace-pre-line ${
                        msg.type === "user"
                          ? "rounded-tr-sm bg-primary text-white font-medium"
                          : "rounded-tl-sm bg-muted/50 text-foreground"
                      }`}
                    >
                      {msg.isImage ? (
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5" />
                          {msg.content}
                        </span>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Placeholder note */}
              <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
                Ví dụ thực tế từ CaloTrack
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
