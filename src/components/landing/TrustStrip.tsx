"use client";

import { motion } from "framer-motion";
import { CreditCard, MessagesSquare } from "lucide-react";

export const TrustStrip = () => {
  return (
    <section className="relative z-10 -mt-8 pb-4">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid gap-3 md:grid-cols-2">

          {/* Card 1: Chat Telegram - Zalo */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45 }}
            className="rounded-[24px] border border-primary/10 bg-white px-5 py-5 shadow-sm backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-2xl bg-primary/10 p-2 text-primary mt-0.5">
                <MessagesSquare className="h-5 w-5" />
              </span>
              <div>
                <div className="text-lg font-bold leading-tight text-foreground">
                  Chat trực tiếp{" "}
                  <span style={{ color: "#2AABEE" }}>Telegram</span>
                  <span className="text-foreground font-bold"> - </span>
                  <span style={{ color: "#0068FF" }}>Zalo</span>
                </div>
                <div className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Tracking Chat Live với model &amp; Engine tính toán đặc biệt của Calo Bot
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Portal + Dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.45 }}
            className="rounded-[24px] border border-border bg-white px-5 py-5 shadow-sm backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-2xl bg-primary/10 p-2 text-primary mt-0.5">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <div className="text-lg font-bold leading-tight text-foreground">
                  Portal + Dashboard vận hành
                </div>
                <div className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  User Dashboard tổng quan, user-friendly — billing, payment, admin backoffice tích hợp ngay trên một nền tảng.
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
