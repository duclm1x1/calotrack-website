"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, BrainCircuit, Camera } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Gửi từ Telegram trước",
    description:
      "Bắt đầu bằng ảnh bữa ăn hoặc câu chat ngắn trong Telegram. Bạn không phải đổi sang một app tracking riêng chỉ để log cho xong việc.",
    color: "primary",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "AI đọc món và follow-up",
    description:
      "CaloTrack ước tính calories, macro, khẩu phần và giữ ngữ cảnh để bạn sửa tiếp hoặc log nhanh hơn ngay trong mạch trò chuyện.",
    color: "flame",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Portal gom account và recap",
    description:
      "Website lo phần pricing, account, billing, dashboard và admin backoffice. Về sau khi Zalo riêng sẵn sàng, frontend này không cần đổi lại.",
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
            Một vòng đời <span className="text-gradient-primary">chat-first nhưng vận hành như SaaS</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            CaloTrack không ép mọi thứ dồn vào website. Tracking đi qua chat để nhanh và tự nhiên, còn web
            lo những thứ người dùng và đội vận hành cần cho account, billing, recap và backoffice.
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
      </div>
    </section>
  );
};
