import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  { question: "CaloTrack sai món thì sao?", answer: "Bạn xác nhận/sửa nhanh trong chat (1/2/3). Hệ thống học dần theo khẩu vị của bạn, nên sẽ chính xác hơn theo thời gian." },
  { question: "Không muốn lưu ảnh?", answer: "Bạn có thể nhập tay thay vì gửi ảnh. Ảnh chỉ dùng để phân tích và có thể lưu dưới dạng link tạm thời (tùy chế độ bạn chọn)." },
  { question: "Pro có giới hạn số ảnh/ngày không?", answer: "Gói Pro cho phép phân tích ảnh không giới hạn với chính sách fair-use. Phù hợp cho người dùng cá nhân với mục đích theo dõi dinh dưỡng hàng ngày." },
  { question: "Có thay thế chuyên gia dinh dưỡng không?", answer: "Không. CaloTrack là công cụ theo dõi & gợi ý, không phải tư vấn y khoa. Nếu bạn có vấn đề sức khỏe, hãy tham khảo ý kiến bác sĩ hoặc chuyên gia dinh dưỡng." },
  { question: "Hủy gói/hoàn tiền thế nào?", answer: "Bạn có thể hủy gói bất cứ lúc nào qua chat hoặc email support. Hoàn tiền trong 7 ngày đầu nếu chưa hài lòng với dịch vụ. Liên hệ support@calotrack.vn để được hỗ trợ." },
];

export const FAQ = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Câu hỏi <span className="text-gradient-primary">thường gặp</span></h2>
        </motion.div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: index * 0.1 }} className="card-base overflow-hidden">
              <button onClick={() => setOpenIndex(openIndex === index ? null : index)} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors">
                <span className="font-semibold text-foreground pr-4">{faq.question}</span>
                <motion.div animate={{ rotate: openIndex === index ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </motion.div>
              </button>
              <motion.div initial={false} animate={{ height: openIndex === index ? "auto" : 0, opacity: openIndex === index ? 1 : 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="px-6 pb-4 text-muted-foreground">{faq.answer}</div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
