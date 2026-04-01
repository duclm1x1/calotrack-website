"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { SITE_CONFIG } from "@/lib/siteConfig";

const faqs = [
  {
    question: "CaloTrack hoạt động như thế nào?",
    answer:
      "Bạn có thể gửi ảnh bữa ăn, nhắn tên món hoặc khẩu phần trong chat, sau đó CaloTrack sẽ ước tính calories và macro để bạn theo dõi ngay trong cuộc trò chuyện.",
  },
  {
    question: "Telegram, website và Zalo khác nhau ra sao?",
    answer:
      "Cả Zalo và Telegram đều là trợ lý Chat AI giúp bạn theo dõi bữa ăn. Website đóng vai trò bảo vệ tài khoản, truy xuất hóa đơn thanh toán và quản lý các thiết lập nâng cao.",
  },
  {
    question: "Portal web có thay thế trải nghiệm chat không?",
    answer:
      "Website không sinh ra để thay thế thói quen chat của bạn. Hãy tiếp tục sử dụng Zalo hoặc Telegram để ghi chép món ăn nhanh nhất, và dùng Website để nhìn lại tiến độ của mình mỗi tuần.",
  },
  {
    question: "AI có hiểu món Việt không?",
    answer:
      "Có. CaloTrack được tối ưu để hiểu tốt hơn các món Việt và khẩu phần đời thường, dù bạn vẫn luôn có thể sửa estimate nếu muốn chính xác hơn.",
  },
  {
    question: "Khi nào tôi nên nâng cấp Pro hoặc Lifetime?",
    answer: `Nếu bạn sử dụng CaloTrack thường xuyên và muốn mở khóa toàn bộ giới hạn phân tích cũng như xem báo cáo nâng cao thì gói Pro hoặc Lifetime sẽ rất phù hợp. Liên hệ ${SITE_CONFIG.supportEmail} nếu bạn cần tư vấn.`,
  },
  {
    question: "Dữ liệu có an toàn và bảo mật không?",
    answer:
      "Mọi dữ liệu của bạn đều được mã hóa riêng biệt. Hệ thống đăng nhập không sử dụng mật khẩu mà xác thực trực tiếp qua số điện thoại để đảm bảo tính an toàn mức cao nhất.",
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
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
                className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
              >
                <span className="pr-4 font-semibold text-foreground">{faq.question}</span>
                <motion.div animate={{ rotate: openIndex === index ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                </motion.div>
              </button>
              <motion.div
                id={`faq-answer-${index}`}
                role="region"
                aria-labelledby={`faq-question-${index}`}
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
