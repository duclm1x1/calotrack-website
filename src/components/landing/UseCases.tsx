"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Compass, HeartHandshake, Sparkles } from "lucide-react";

const values = [
  {
    icon: Compass,
    title: "Tầm nhìn",
    description:
      "Biến việc theo dõi ăn uống thành một trải nghiệm đơn giản, gần gũi và đủ thông minh để gắn bó lâu dài với đời sống thực tế.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: HeartHandshake,
    title: "Sứ mệnh",
    description:
      "Giúp nhiều người hiểu bữa ăn của mình rõ hơn mỗi ngày mà không cần biến chuyện ăn uống thành một công việc nặng đầu.",
    color: "from-primary to-primary/70",
  },
  {
    icon: Sparkles,
    title: "Triết lý",
    description:
      "CaloTrack ưu tiên trải nghiệm ấm áp, tự nhiên và thực dụng: bớt phức tạp, bớt áp lực, nhưng vẫn giữ thông tin đủ tốt để ra quyết định.",
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
          className="mb-12 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Về <span className="text-gradient-primary">chúng tôi</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            CaloTrack được xây để trở thành một AI nutrition assistant dành cho đời sống thật:
            dễ dùng, đáng tin và đủ linh hoạt để đi cùng nhiều thói quen ăn uống khác nhau.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {values.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card-base group p-6 text-center transition-all hover:-translate-y-1 hover:shadow-elegant"
              >
                <div
                  className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} transition-transform group-hover:scale-110`}
                >
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.blockquote
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="mx-auto mt-10 max-w-3xl rounded-3xl border border-border bg-muted/50 px-8 py-8 text-center"
        >
          <p className="text-lg font-medium leading-8 text-foreground">
            “Theo dõi ăn uống không nên là một công việc nặng đầu. Nó nên là một cuộc trò chuyện
            đủ thông minh để giúp bạn hiểu mình đang ăn gì và đang tiến xa tới đâu.”
          </p>
        </motion.blockquote>
      </div>
    </section>
  );
};
