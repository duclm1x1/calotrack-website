import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { User, Bot } from "lucide-react";

const chatMessages = [
  {
    type: "user",
    content: "[gửi ảnh cơm tấm]",
    isImage: true,
  },
  {
    type: "bot",
    content: "~650 kcal | P 32g • C 78g • F 18g\nHôm nay bạn còn ~850 kcal để giữ mục tiêu deficit.",
    isImage: false,
  },
  {
    type: "user",
    content: "còn lại hôm nay?",
    isImage: false,
  },
  {
    type: "bot",
    content: "Bạn còn ~850 kcal. Gợi ý bữa ≤ 500 kcal: salad gà, cháo yến mạch, hoặc sandwich ức gà.",
    isImage: false,
  },
];

export const Demo = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="demo" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Xem CaloTrack trả kết quả{" "}
            <span className="text-gradient-primary">ngay trong chat</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Gửi ảnh → nhận kcal/macro → hỏi "còn lại?" → CaloTrack tự tổng kết
            mỗi ngày.
          </p>
        </motion.div>

        <div className="max-w-lg mx-auto">
          {/* Chat Container */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-background rounded-3xl shadow-elegant border border-border overflow-hidden"
          >
            {/* Chat Header */}
            <div className="bg-primary/10 px-6 py-4 border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">CaloTrack</h3>
                <p className="text-xs text-muted-foreground">Trợ lý dinh dưỡng AI</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="p-4 space-y-4 min-h-[400px]">
              {chatMessages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.3 }}
                  className={`flex items-end gap-2 ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.type === "bot" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.type === "user"
                        ? "bg-[#0068FF] text-white rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {message.isImage ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-16 bg-gradient-to-br from-amber-200 to-orange-300 rounded-lg flex items-center justify-center text-2xl">
                          🍚
                        </div>
                        <span className="text-sm opacity-80">Ảnh cơm tấm</span>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-line">{message.content}</p>
                    )}
                  </div>
                  {message.type === "user" && (
                    <div className="w-8 h-8 rounded-full bg-[#0068FF]/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-[#0068FF]" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-2 bg-muted rounded-full px-4 py-3">
                <span className="text-muted-foreground text-sm">Nhập tin nhắn...</span>
              </div>
            </div>
          </motion.div>

          {/* Demo note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 1.5 }}
            className="text-center text-sm text-muted-foreground mt-6"
          >
            Demo mô phỏng. Kết quả thực tế có thể khác tùy món ăn.
          </motion.p>
        </div>
      </div>
    </section>
  );
};
