import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
          className="text-center max-w-2xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Bắt đầu ngay với{" "}
            <span className="text-gradient-primary">bữa ăn gần nhất</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Mở Zalo → tìm "CaloTrack OA" → gửi "bắt đầu" hoặc gửi ảnh bữa ăn.
          </p>

          <Button
            size="lg"
            asChild
            className="bg-[#0068FF] hover:bg-[#0052CC] text-white gap-2 text-lg px-10 py-7"
          >
            <a
              href="https://zalo.me/your-oa-id"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="w-6 h-6" />
              Chat trên Zalo
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
