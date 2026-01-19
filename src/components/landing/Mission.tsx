import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Eye, Target, Heart } from "lucide-react";

const cards = [
  {
    icon: Eye,
    title: "Tầm Nhìn",
    content:
      "Trở thành người bạn đồng hành dinh dưỡng #1 cho người Việt — thông minh, thân thiện, và luôn sẵn sàng giúp đỡ.",
    gradient: "from-teal/10 to-teal/5",
  },
  {
    icon: Target,
    title: "Sứ Mệnh",
    content:
      "Đơn giản hóa việc theo dõi calo, giúp mọi người kiểm soát sức khỏe mà không cần kiến thức chuyên môn hay công cụ phức tạp.",
    gradient: "from-flame/10 to-flame/5",
  },
  {
    icon: Heart,
    title: "Triết Lý",
    content:
      "Không phán xét, chỉ hỗ trợ. Chúng tôi tin rằng thay đổi bền vững đến từ sự tự nhận thức và hành động nhỏ mỗi ngày.",
    gradient: "from-teal/10 to-flame/5",
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
          <p className="tagline mb-4">Về chúng tôi</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Câu chuyện <span className="text-gradient-teal">Calo Track</span>
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
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
            "Kiểm soát calo, làm chủ bữa ăn"
          </blockquote>
          <p className="mt-4 text-muted-foreground">— Slogan Calo Track</p>
        </motion.div>
      </div>
    </section>
  );
};
