import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Calo Track hoạt động như thế nào?",
    answer:
      "Bạn chỉ cần gửi ảnh hoặc mô tả bữa ăn qua Zalo/Telegram/Messenger. AI sẽ phân tích và ước tính calo, macro trong vài giây. Dữ liệu tự động đồng bộ lên dashboard web để bạn theo dõi.",
  },
  {
    question: "AI có nhận diện được món Việt không?",
    answer:
      "Có! AI của chúng tôi được huấn luyện đặc biệt với hàng trăm món ăn Việt Nam phổ biến như phở, bún bò, bánh mì, cơm tấm... Độ chính xác liên tục được cải thiện.",
  },
  {
    question: "Gói Free có giới hạn gì?",
    answer:
      "Gói Free cho phép bạn log 3 ảnh/ngày, theo dõi calo cơ bản, và sử dụng tính năng streak & badge. Không giới hạn thời gian sử dụng.",
  },
  {
    question: "Tôi có thể hủy đăng ký Pro bất cứ lúc nào không?",
    answer:
      "Hoàn toàn được! Bạn có thể hủy đăng ký Pro bất cứ lúc nào. Sau khi hủy, bạn vẫn sử dụng được tính năng Pro đến hết chu kỳ thanh toán.",
  },
  {
    question: "Dữ liệu của tôi có được bảo mật không?",
    answer:
      "Tuyệt đối! Dữ liệu được mã hóa end-to-end, lưu trữ an toàn trên cloud. Chúng tôi không bán hoặc chia sẻ dữ liệu với bên thứ ba.",
  },
  {
    question: "Làm sao để kết nối với chatbot?",
    answer:
      "Sau khi đăng ký, bạn sẽ nhận được link hoặc QR code để kết nối với chatbot qua Zalo/Telegram/Messenger. Chỉ cần scan và bắt đầu gửi ảnh bữa ăn!",
  },
];

export const FAQ = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section ref={containerRef} id="faq" className="section-padding bg-gradient-section">
      <div className="container-narrow mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="tagline mb-4">Câu hỏi thường gặp</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Có thắc mắc? <span className="text-gradient-teal">Chúng tôi giải đáp</span>
          </h2>
        </motion.div>

        {/* FAQ List */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div
                className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                  openIndex === index
                    ? "bg-card border-primary/30 shadow-md"
                    : "bg-card/50 border-border hover:border-primary/20"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-semibold pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 flex-shrink-0 text-primary transition-transform duration-300 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <motion.div
                  initial={false}
                  animate={{
                    height: openIndex === index ? "auto" : 0,
                    opacity: openIndex === index ? 1 : 0,
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6">
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* More help */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12 text-center"
        >
          <p className="text-muted-foreground">
            Vẫn còn thắc mắc?{" "}
            <a
              href="#contact"
              className="text-primary font-medium hover:underline"
            >
              Liên hệ với chúng tôi
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
};
