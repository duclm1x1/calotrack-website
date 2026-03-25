"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { SITE_CONFIG } from "@/lib/siteConfig";

const faqs = [
  {
    question: "CaloTrack hoạt động như thế nào?",
    answer:
      "Bạn có thể gửi ảnh bữa ăn, nhắn tên món hoặc khẩu phần, sau đó CaloTrack sẽ ước tính calories và macro để bạn theo dõi ngay trong cuộc trò chuyện.",
  },
  {
    question: "AI có nhận diện được món Việt không?",
    answer:
      "Có. CaloTrack được tối ưu để hiểu tốt hơn các món Việt và những kiểu khẩu phần đời thường, dù bạn vẫn luôn có thể sửa lại nếu muốn chính xác hơn.",
  },
  {
    question: "Tôi có cần cân đồ ăn mỗi lần không?",
    answer:
      "Không bắt buộc. Bạn có thể dùng ảnh, mô tả đơn giản hoặc thêm gram nếu muốn chi tiết hơn. CaloTrack được thiết kế để vừa tiện vừa đủ chính xác cho sử dụng hằng ngày.",
  },
  {
    question: "Tôi có thể dùng CaloTrack trên Zalo hoặc Telegram không?",
    answer:
      "Có. CaloTrack được định hướng là một trải nghiệm chat-first đa kênh, với lớp website dùng để giới thiệu sản phẩm, quản lý tài khoản và vận hành hệ thống.",
  },
  {
    question: "Dữ liệu của tôi có an toàn không?",
    answer:
      "CaloTrack xây theo hướng dữ liệu có cấu trúc, có lớp quản trị và khả năng kiểm soát tốt hơn theo thời gian. Đây là nền tảng để sản phẩm trở nên đáng tin cậy khi dùng lâu dài.",
  },
  {
    question: "Khi nào tôi nên nâng cấp Pro?",
    answer: `Nếu bạn dùng CaloTrack thường xuyên, cần AI nhiều hơn hoặc muốn trải nghiệm mượt hơn cho các flow phân tích ảnh và follow-up, gói Pro sẽ hợp lý hơn. Nếu cần hỗ trợ thêm, bạn có thể liên hệ ${SITE_CONFIG.supportEmail}.`,
  },
];

export const FAQ = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
            Câu hỏi <span className="text-gradient-primary">thường gặp</span>
          </h2>
        </motion.div>

        <div className="mx-auto max-w-3xl space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.08 }}
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
