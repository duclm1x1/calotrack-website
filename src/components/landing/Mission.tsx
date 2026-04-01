import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Target, MessageCircle, LineChart, Dumbbell } from "lucide-react";

const cards = [
  {
    icon: Target,
    title: "Người muốn kiểm soát vóc dáng",
    content: "Đang muốn giảm mỡ hoặc giữ cân nhưng không thích dùng các app đếm calo phức tạp, thao tác rườm rà.",
    gradient: "from-teal/10 to-teal/5",
  },
  {
    icon: MessageCircle,
    title: "Yêu thích sự tiện lợi",
    content: "Muốn theo dõi ăn uống trực tiếp qua khung chat Telegram hoặc Zalo như đang nhắn tin cho bạn bè.",
    gradient: "from-flame/10 to-flame/5",
  },
  {
    icon: LineChart,
    title: "Cần theo dõi tiến độ",
    content: "Người cần một người trợ lý (coach) phân tích dinh dưỡng và theo dõi báo cáo tiến độ đều đặn mỗi ngày.",
    gradient: "from-blue-500/10 to-blue-500/5",
  },
  {
    icon: Dumbbell,
    title: "Người tập luyện thể thao",
    content: "Người tập gym muốn có chế độ hỗ trợ riêng biệt, tính macro chuyên sâu và tối ưu hóa hiệu suất buổi tập.",
    gradient: "from-slate-700/10 to-slate-700/5",
  },
];

export const Mission = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section ref={containerRef} className="section-padding bg-gradient-section">
      <div className="container-wide mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="tagline mb-4 justify-center">Chân dung người dùng</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            CaloTrack <span className="text-gradient-teal">khiến ai thay đổi?</span>
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div
                className={`relative h-full rounded-3xl p-8 bg-gradient-to-br ${card.gradient} border border-border/50 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
              >
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl bg-card shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="w-7 h-7 text-primary" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold mb-4">{card.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {card.content}
                </p>

                {/* Decorative corner */}
                <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-primary/5 blur-2xl" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quote */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 text-center"
        >
          <blockquote className="text-xl md:text-2xl font-medium text-foreground/80 italic max-w-3xl mx-auto">
            "Sức khỏe của bạn, thói quen của bạn, hệ sinh thái của chúng tôi."
          </blockquote>
        </motion.div>
      </div>
    </section>
  );
};
