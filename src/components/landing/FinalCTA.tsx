"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/siteConfig";

export const FinalCTA = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding bg-gradient-to-br from-primary/10 via-background to-flame/5">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Bat dau ngay voi <span className="text-gradient-primary">bua an gan nhat</span>
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Mo Telegram, tim CaloTrack, gui &quot;bat dau&quot; hoac gui anh bua an.
            Website nay giup ban xem bang gia, thanh toan va quan ly van hanh.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="gap-2 bg-[#229ED9] px-10 py-7 text-lg text-white hover:bg-[#1d90c4]"
            >
              <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-6 w-6" />
                Dung tren Telegram
              </a>
            </Button>

            <Button size="lg" variant="outline" asChild className="px-10 py-7 text-lg">
              <a href={SITE_CONFIG.pricingAnchor}>Xem bang gia</a>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {SITE_CONFIG.secondaryChannelLabel} se duoc mo sau khi gateway normalization va SaaS gate Telegram da on dinh.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
