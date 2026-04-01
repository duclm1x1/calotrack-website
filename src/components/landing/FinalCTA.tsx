"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Mail, MessageCircle, Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG, getPrimaryChannelCta, getPrimaryChannelHref } from "@/lib/siteConfig";

export const FinalCTA = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="contact" className="section-padding bg-gradient-to-br from-primary/10 via-background to-accent/5">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Bắt đầu bằng <span className="text-gradient-primary">chat hôm nay</span>, quản lý bằng portal khi cần
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Bạn có thể vào Telegram để dùng ngay, hoặc đăng nhập portal web nếu muốn xem account, billing,
            quota và lớp quản trị đang mở rộng dần.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="gap-2 px-10 py-7 text-lg bg-[#0068FF] hover:bg-[#005AE0] text-white border-0 shadow-lg">
              <a href={getPrimaryChannelHref()} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-6 w-6" />
                {getPrimaryChannelCta()}
              </a>
            </Button>

            <Button size="lg" variant="outline" asChild className="px-10 py-7 text-lg">
              <a href="/login">
                <Monitor className="mr-2 h-5 w-5" />
                Vào portal web
              </a>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/80 p-5 backdrop-blur">
              <p className="text-sm text-muted-foreground">Email hỗ trợ</p>
              <a
                href={`mailto:${SITE_CONFIG.supportEmail}`}
                className="mt-2 inline-flex items-center gap-2 font-semibold text-foreground"
              >
                <Mail className="h-4 w-4 text-primary" />
                {SITE_CONFIG.supportEmail}
              </a>
            </div>
            <div className="rounded-2xl border border-border bg-background/80 p-5 backdrop-blur">
              <p className="text-sm text-muted-foreground">Trạng thái channel</p>
              <div className="mt-2 text-sm font-semibold text-foreground">
                Telegram• Zalo đã tích hợp công nghệ AI mới nhất ChatGPT, Claude, Gemini
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
