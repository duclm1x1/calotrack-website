"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, BrainCircuit, Camera } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Gửi ảnh qua Zalo / Telegram",
    description:
      "Chụp ảnh bữa ăn hoặc nhập tên món và số gram. Không cần tải app hay tìm kiếm rườm rà, mọi thao tác ghi chép diễn ra tự nhiên như đang nhắn tin cho bạn bè.",
    color: "primary",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "AI phân tích & tính toán",
    description:
      "Trí tuệ nhân tạo sẽ lập tức nhận diện món ăn thực tế tại Việt Nam, bóc tách khẩu phần, tính toán lượng calo và chỉ số Macro trả về ngay lập tức trong khung chat.",
    color: "flame",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Theo dõi tiến độ chuyên sâu",
    description:
      "Website đóng vai trò như một bảng điều khiển trung tâm giúp bạn xem biểu đồ dinh dưỡng chi tiết, báo cáo tiến độ theo tuần và thiết lập lại các mục tiêu cá nhân.",
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
            Trải nghiệm mượt mà từ <span className="text-gradient-primary">Chat đến Website</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            CaloTrack kết hợp sự tiện lợi của tin nhắn và sức mạnh phân tích của website. Bạn chỉ cần gửi tin nhắn hoặc hình ảnh qua Zalo/Telegram để ghi chép, hệ thống AI sẽ tự động lo phần còn lại.
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
