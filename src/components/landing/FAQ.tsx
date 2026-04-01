"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "CaloTrack có phải app không?",
    answer: "CaloTrack không phải là một app riêng cần cài đặt. Bạn có thể dùng trực tiếp qua Telegram hoặc Zalo, nên trải nghiệm sẽ nhanh và tiện hơn như đang chat bình thường.",
  },
  {
    question: "Tôi dùng trên Telegram hay Zalo?",
    answer: "Bạn có thể dùng CaloTrack trên Telegram hoặc Zalo. Tùy kênh nào bạn tiện hơn, bạn chỉ cần kết nối tài khoản và bắt đầu theo dõi bữa ăn, cân nặng, tiến độ và sử dụng các tính năng coach.",
  },
  {
    question: "Có thể ghi món bằng ảnh không?",
    answer: "Có. Bạn có thể gửi ảnh món ăn để CaloTrack phân tích và hỗ trợ review bữa ăn. Ngoài ảnh, bạn cũng có thể ghi món bằng text như chat bình thường để lưu nhanh hơn.",
  },
  {
    question: "Có xem lại thống kê ngày/tuần/tháng được không?",
    answer: "Có. CaloTrack hỗ trợ xem lại thống kê theo ngày, tuần, và tháng. Bạn có thể theo dõi lượng ăn, tiến độ và xu hướng của mình thay vì chỉ nhìn từng bữa riêng lẻ.",
  },
  {
    question: "Gym mode là gì?",
    answer: "Gym mode là chế độ hỗ trợ chuyên sâu hơn cho người đang tập luyện. Khi bật gym mode, bạn có thể nhận các phản hồi và hướng dẫn tập trung hơn vào nhu cầu workout, buổi tập, và các câu hỏi liên quan đến tập luyện.",
  },
  {
    question: "Gói Pro khác gì Free?",
    answer: "Gói Free phù hợp để trải nghiệm CaloTrack ở mức cơ bản. Gói Pro dành cho người muốn theo dõi nghiêm túc hơn, với các quyền lợi như theo dõi bữa ăn qua chat, xem thống kê ngày/tuần/tháng, gym mode, lịch sử đầy đủ và ưu tiên xử lý.",
  },
  {
    question: "Lifetime có thật sự giới hạn 50 suất không?",
    answer: "Có. Gói Lifetime là ưu đãi giới hạn và hiện chỉ mở 50 suất. Đây không phải gói bán đại trà lâu dài, nên khi đủ số lượng, CaloTrack có thể đóng gói này bất kỳ lúc nào.",
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
