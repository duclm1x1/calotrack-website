"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { SITE_CONFIG } from "@/lib/siteConfig";

const faqs = [
  {
    question: "CaloTrack sai mon thi sao?",
    answer:
      "Ban xac nhan hoac sua nhanh ngay trong chat. Follow-up context va image route duoc thiet ke de sua estimate truoc khi luu.",
  },
  {
    question: "Website co phai san pham chinh khong?",
    answer:
      "Chua. Phase 1 la Telegram-first. Website hien tai dung cho acquisition, pricing, thanh toan, admin va mot portal beta nhe.",
  },
  {
    question: "Pro co gioi han so anh moi ngay khong?",
    answer:
      "Free tier co hard daily limit. Pro va Lifetime duoc cap entitlement cao hon, nhung van co fair-use va abuse guardrail o workflow entry.",
  },
  {
    question: "Portal web da dong bo du lieu voi bot chua?",
    answer:
      "Moi o muc beta scaffold. Identity linking giua Supabase Auth va bot user se la phase sau, nen data production van uu tien bot.",
  },
  {
    question: "Ho tro thanh toan / hoan tien nhu the nao?",
    answer: `Ban lien he ${SITE_CONFIG.supportEmail} hoac support qua Telegram. Payment se duoc audit qua transaction history va subscription events.`,
  },
];

export const FAQ = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Cau hoi <span className="text-gradient-primary">thuong gap</span>
          </h2>
        </motion.div>

        <div className="mx-auto max-w-3xl space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="card-base overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <span className="pr-4 font-semibold text-foreground">{faq.question}</span>
                <motion.div animate={{ rotate: openIndex === index ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                </motion.div>
              </button>
              <motion.div
                initial={false}
                animate={{ height: openIndex === index ? "auto" : 0, opacity: openIndex === index ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-4 text-muted-foreground">{faq.answer}</div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
