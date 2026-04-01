import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Mail, MessageCircle } from "lucide-react";

export const Contact = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section ref={containerRef} id="contact" className="section-padding bg-mesh">
      <div className="container-narrow mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <p className="tagline mb-4">Liên hệ</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Có câu hỏi?{" "}
              <span className="text-gradient-flame">Hãy nhắn cho chúng tôi</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Đội ngũ Calo Track luôn sẵn sàng hỗ trợ bạn. Gửi tin nhắn và chúng
              tôi sẽ phản hồi trong vòng 24 giờ.
            </p>

            {/* Contact methods */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="icon-box">
                  <Mail className="w-5 h-5 text-teal" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">support@calotrack.vn</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="icon-box-flame">
                  <MessageCircle className="w-5 h-5 text-flame" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Zalo OA</p>
                  <p className="font-medium">@CaloTrack</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="card-elevated p-8 md:p-12 rounded-[2rem] flex flex-col items-center justify-center text-center border-t-4 border-t-[#0068FF]"
          >
            <div className="w-20 h-20 bg-[#0068FF]/10 rounded-full flex items-center justify-center mb-6">
              <MessageCircle className="w-10 h-10 text-[#0068FF]" />
            </div>
            <h3 className="text-2xl font-bold mb-4">Kết nối trực tiếp nhanh chóng</h3>
            <p className="text-muted-foreground mb-8 text-lg">
              Thay vì điền form, hãy nhắn tin trực tiếp với chuyên viên tư vấn của CaloTrack qua Zalo OA để được hỗ trợ setup gói cước và giải đáp ngay lập tức.
            </p>
            <a
              href="https://zalo.me/4423588403113387176"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#0068FF] hover:bg-[#005AE0] text-white px-8 py-4 rounded-full font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 w-full max-w-sm"
            >
              <MessageCircle className="w-5 h-5" />
              Chat hỗ trợ trên Zalo
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
