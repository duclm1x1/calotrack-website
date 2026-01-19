import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Briefcase, Scale, Dumbbell, Users } from "lucide-react";

const useCases = [
  {
    icon: Briefcase,
    title: "Người bận rộn",
    description: "Muốn kiểm soát calo nhanh gọn bằng 1–2 tin nhắn.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Scale,
    title: "Siết cân / giữ cân",
    description: "Cần bám deficit, biết \"còn lại hôm nay\" rõ ràng.",
    color: "from-primary to-primary/70",
  },
  {
    icon: Dumbbell,
    title: "Tăng cơ",
    description: "Cần macro gần-sát và protein đủ mỗi ngày.",
    color: "from-flame to-amber-500",
  },
  {
    icon: Users,
    title: "Coach / Team",
    description: "Theo dõi nhiều học viên, xem báo cáo tuân thủ theo tuần.",
    color: "from-purple-500 to-pink-500",
  },
];

export const UseCases = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ai nên dùng{" "}
            <span className="text-gradient-primary">CaloTrack</span>?
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card-base p-6 text-center group hover:shadow-elegant transition-all hover:-translate-y-1"
              >
                <div
                  className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${useCase.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground">
                  {useCase.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {useCase.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
