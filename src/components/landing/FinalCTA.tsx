"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/siteConfig";

export const FinalCTA = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="contact" className="section-padding bg-gradient-to-br from-primary/10 via-background to-flame/5">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Sẵn sàng bắt đầu với <span className="text-gradient-primary">bữa ăn tiếp theo</span>?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Bạn có thể bắt đầu miễn phí ngay hôm nay, hoặc liên hệ đội ngũ CaloTrack nếu muốn
            được tư vấn thêm về cách dùng, gói phù hợp hay các kênh triển khai.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="gap-2 bg-[#229ED9] px-10 py-7 text-lg text-white hover:bg-[#1d90c4]"
            >
              <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-6 w-6" />
                Trải nghiệm ngay
              </a>
            </Button>

            <Button size="lg" variant="outline" asChild className="px-10 py-7 text-lg">
              <a href={SITE_CONFIG.pricingAnchor}>Xem bảng giá</a>
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
              <p className="text-sm text-muted-foreground">Kênh trải nghiệm nhanh</p>
              <a
                href={SITE_CONFIG.telegramBotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 font-semibold text-foreground"
              >
                <MessageCircle className="h-4 w-4 text-primary" />
                CaloTrack trên Telegram
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
