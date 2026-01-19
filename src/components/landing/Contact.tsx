import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Send, Mail, MessageCircle } from "lucide-react";

export const Contact = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log("Form submitted:", formData);
  };

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

          {/* Right - Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <form
              onSubmit={handleSubmit}
              className="card-elevated p-8 rounded-3xl"
            >
              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium mb-2"
                  >
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-2"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="email@example.com"
                    required
                  />
                </div>

                {/* Message */}
                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium mb-2"
                  >
                    Tin nhắn
                  </label>
                  <textarea
                    id="message"
                    rows={4}
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                    placeholder="Nội dung tin nhắn..."
                    required
                  />
                </div>

                {/* Submit */}
                <button type="submit" className="btn-primary w-full py-4">
                  <Send className="w-5 h-5" />
                  Gửi tin nhắn
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
