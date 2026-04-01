"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Check, MessageCircle, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/siteConfig";

const logo3d = "/logo-3d.png";

const bullets = [
  "Món Việt + ước lượng khẩu phần sát thực tế",
  "Hỏi \"còn lại?\" ra ngay ngân sách kcal trong ngày",
  "Tỉ lệ chuẩn xác lên tới >90%",
];

export const Hero = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const logoRotate = useTransform(scrollYProgress, [0, 1], [0, 15]);
  const logoScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <motion.div
        className="absolute left-[10%] top-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        animate={{ y: [0, 30, 0], x: [0, 15, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 right-[10%] h-80 w-80 rounded-full bg-accent/10 blur-3xl"
        animate={{ y: [0, -25, 0], x: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="container relative z-10 mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-sm font-medium text-primary">Trợ lý dinh dưỡng AI qua chat</span>
            </motion.div>

            <h1 className="mb-6 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl xl:text-7xl tracking-[-0.04em]">
              <span className="text-foreground">Gửi ảnh món ăn → biết kcal/macro trong </span>
              <span className="text-gradient-flame">20 giây</span>
              <br className="hidden lg:block md:hidden sm:hidden" />
              <span className="text-foreground"> — ngay trên </span>
              <span className="text-blue-500">Zalo</span>
            </h1>

            <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground lg:mx-0">
              CaloTrack là trợ lý dinh dưỡng qua chat (Zalo/Telegram). Nhắn ảnh hoặc "món + gram" để theo dõi calo chuẩn món Việt — không cần đếm tay.
            </p>

            <ul className="mb-8 space-y-3">
              {bullets.map((bullet, index) => (
                <motion.li
                  key={bullet}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="flex items-start gap-3 text-left"
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  <span className="text-muted-foreground">{bullet}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row">
              <Button size="lg" asChild className="w-full gap-2 px-8 py-6 text-base sm:w-auto rounded-xl bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg shadow-blue-500/25">
                <a href={SITE_CONFIG.zaloOaUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Chat trên Zalo
                </a>
              </Button>
              <Button size="lg" variant="outline" className="w-full px-8 py-6 text-base sm:w-auto rounded-xl gap-2 hover:bg-muted/50" asChild>
                <a>
                  <PlayCircle className="h-5 w-5" />
                  Xem demo chat 20s
                </a>
              </Button>
            </div>

            <div className="mb-2 text-sm text-muted-foreground text-center lg:text-left">
              Mở Zalo → tìm "CaloTrack OA" → gửi "bắt đầu" hoặc gửi ảnh bữa ăn
            </div>
            <div className="text-xs italic text-muted-foreground/70 text-center lg:text-left max-w-md mx-auto lg:mx-0">
              Không thay thế tư vấn y khoa. Bạn luôn có thể sửa và xóa dữ liệu bất cứ lúc nào.
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="relative flex items-center justify-center"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="h-80 w-80 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 blur-3xl md:h-96 md:w-96"
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <div className="absolute h-[22rem] w-[22rem] md:h-[26rem] md:w-[26rem] lg:h-[30rem] lg:w-[30rem]">
              <svg className="h-full w-full" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="gradient-flow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1">
                      <animate attributeName="offset" values="0;1;0" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="1">
                      <animate attributeName="offset" values="0.5;1.5;0.5" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1">
                      <animate attributeName="offset" values="1;2;1" dur="3s" repeatCount="indefinite" />
                    </stop>
                  </linearGradient>
                </defs>
                <motion.circle
                  cx="100"
                  cy="100"
                  r="95"
                  fill="none"
                  stroke="url(#gradient-flow)"
                  strokeWidth="2"
                  strokeDasharray="15 10"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "center" }}
                />
              </svg>
            </div>

            <motion.div
              className="absolute h-[20rem] w-[20rem] rounded-full border border-primary/10 md:h-[24rem] md:w-[24rem] lg:h-[28rem] lg:w-[28rem]"
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            />

            <motion.div style={{ rotate: logoRotate, scale: logoScale }} className="relative z-10">
              <motion.img
                src={logo3d}
                alt="CaloTrack Logo"
                width={448}
                height={448}
                className="h-80 w-80 object-contain drop-shadow-2xl md:h-96 md:w-96 lg:h-[28rem] lg:w-[28rem]"
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "drop-shadow(0 0 30px hsl(var(--primary) / 0.4))" }}
              />
              <div className="absolute -left-8 top-8 rounded-2xl border border-white/40 bg-white/80 px-4 py-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">Hôm nay</p>
                <p className="mt-1 text-2xl font-bold text-foreground">1.420 kcal</p>
                <p className="text-xs text-muted-foreground">P 96g • C 130g • F 42g</p>
              </div>
              <div className="absolute -bottom-2 right-0 rounded-2xl border border-white/40 bg-white/80 px-4 py-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-accent">Bảo mật hệ thống</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Giao dịch an toàn, minh bạch</p>
                <p className="text-xs text-muted-foreground">Dữ liệu thông tin được lưu trữ 100% bảo mật.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <motion.div
        style={{ opacity }}
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <span className="text-sm text-muted-foreground">Cuộn xuống</span>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <ArrowDown className="h-5 w-5 text-primary" />
        </motion.div>
      </motion.div>
    </section>
  );
};
