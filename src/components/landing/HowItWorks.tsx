"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, BrainCircuit, Camera } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Chụp & Gửi",
    description:
      "Gửi ảnh bữa ăn hoặc nhắn món theo cách tự nhiên nhất, giống như bạn đang nhắn tin cho một người đồng hành theo dõi ăn uống.",
    color: "primary",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "AI Phân Tích",
    description:
      "CaloTrack ước tính calories, macro và khẩu phần để bạn có một bức tranh đủ rõ về bữa ăn mà không phải đo đếm quá nhiều.",
    color: "flame",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Theo Dõi & Báo Cáo",
    description:
      "Xem tổng nạp trong ngày, tiến độ tuần và những gợi ý ngắn gọn để bám sát mục tiêu của bạn dễ hơn.",
    color: "primary",
  },
];

export const HowItWorks = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="section-padding">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Chỉ <span className="text-gradient-primary">3 bước</span> để kiểm soát calo
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Không cần mở một ứng dụng phức tạp hay tự nhập quá nhiều trường dữ liệu.
            Bạn chỉ cần bắt đầu bằng bữa ăn gần nhất, CaloTrack sẽ lo phần còn lại.
          </p>
        </motion.div>

        <div className="mb-12 grid gap-8 md:grid-cols-3 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="absolute left-[60%] top-16 hidden h-0.5 w-[80%] bg-gradient-to-r from-primary/30 to-transparent md:block" />
                )}
                <div className="card-base group p-8 text-center transition-shadow hover:shadow-elegant">
                  <div className="absolute left-1/2 top-[-0.75rem] -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-bold text-primary-foreground">
                    {step.number}
                  </div>
                  <div
                    className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${
                      step.color === "flame"
                        ? "bg-gradient-to-br from-flame-light to-flame"
                        : "bg-gradient-to-br from-primary/80 to-primary"
                    }`}
                  >
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center"
        >
          <p className="mx-auto max-w-3xl text-sm text-muted-foreground">
            Mục tiêu của CaloTrack là làm cho việc theo dõi ăn uống trở nên nhẹ nhàng hơn:
            ít ma sát hơn, hiểu bữa ăn nhanh hơn và nhìn tiến độ rõ hơn theo từng ngày.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
