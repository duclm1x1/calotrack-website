"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowDown, Check, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePortalSiteConfig } from "@/contexts/PortalSiteConfigContext";

const logo3d = "/logo-new-main.png";

const bullets = [
  "Huấn luyện viên AI đồng hành 24/7 qua chat.",
  "Phân tích bữa ăn từ văn bản hoặc ảnh chụp ngay trong vài giây.",
  "Am hiểu món Việt để bạn log nhanh mà vẫn sát thực tế.",
  "Theo dõi mục tiêu giảm mỡ, giữ cân, tăng cơ và gym mode trên cùng một nơi.",
];

export const Hero = () => {
  const { siteConfig } = usePortalSiteConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const logoRotate = useTransform(scrollYProgress, [0, 1], [0, 15]);
  const logoScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,158,217,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_26%)]" />

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
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/75 px-4 py-2 shadow-sm backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-sm font-medium text-primary">AI Nutrition & Workout Coach</span>
            </motion.div>

            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
              Tối giản lộ trình. Tối đa kết quả với <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-[#229ED9] via-primary to-emerald-500 bg-clip-text text-transparent">
                CaloTrack AI
              </span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-lg leading-8 text-muted-foreground lg:mx-0">
              Ghi bữa ăn nhanh qua Zalo hoặc Telegram, nhận tư vấn theo mục tiêu cá nhân và xem dashboard ngày,
              tuần, tháng mà không cần học một app phức tạp.
            </p>

            <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row lg:items-stretch">
              <Button
                size="lg"
                asChild
                className="w-full gap-2 rounded-xl border-0 bg-[#229ED9] px-8 py-6 text-base text-white shadow-lg shadow-[#229ED9]/25 hover:bg-[#1C88B9] sm:w-auto"
              >
                <Link to={siteConfig.checkoutPath}>
                  <MessageCircle className="h-5 w-5" />
                  Bắt đầu trên Telegram
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="w-full gap-2 rounded-xl border-0 bg-[#0068FF] px-8 py-6 text-base text-white shadow-lg shadow-[#0068FF]/20 hover:bg-[#005AE0] sm:w-auto"
              >
                <Link to={siteConfig.checkoutPath}>
                  <MessageCircle className="h-5 w-5" />
                  Bắt đầu với Zalo
                </Link>
              </Button>
            </div>

            <div className="mb-6">
              <Button variant="link" asChild className="px-0 text-muted-foreground hover:text-primary">
                <Link to={siteConfig.checkoutPath}>Xem gói Pro và quyền lợi nâng cấp</Link>
              </Button>
            </div>

            <ul className="space-y-3 text-left">
              {bullets.map((bullet, index) => (
                <motion.li
                  key={bullet}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.08 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <span className="text-sm font-medium leading-6 text-zinc-700">{bullet}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.85, delay: 0.2, ease: "easeOut" }}
            className="relative flex min-h-[540px] items-center justify-center"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="h-80 w-80 rounded-full bg-gradient-to-br from-primary/35 via-accent/20 to-emerald-500/15 blur-3xl md:h-96 md:w-96"
                animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.75, 0.45] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
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
                style={{ filter: "drop-shadow(0 0 30px hsl(var(--primary) / 0.35))" }}
              />

              <div className="absolute -left-8 top-6 min-w-[178px] rounded-2xl border border-white/40 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80 mt-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Nutrition hôm nay</p>
                <p className="mt-1 text-xl font-bold leading-tight text-foreground">1.420 / 2.471 kcal</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Protein 96g • Carb 130g • Fat 42g</p>
              </div>

              <div className="absolute -right-8 -bottom-4 min-w-[196px] rounded-2xl border border-white/40 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-500">Tiến độ</p>
                <p className="mt-1 text-xs font-medium text-foreground">
                  TDEE 2471 • Đã nạp <span className="font-bold text-primary">1.730</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  🏃 Chạy bộ: <span className="font-semibold text-foreground">352 kcal</span>
                </p>
              </div>

              <div className="absolute -right-8 md:-right-16 lg:-right-24 top-1/2 -translate-y-1/2 min-w-[168px] rounded-2xl border border-white/40 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Gym Mode</p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  <span className="text-emerald-500">●</span> ON
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Coach chuyên sâu cho buổi tập hôm nay</p>
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
