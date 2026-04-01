"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Bell, CreditCard, MessageCircle, PieChart, Shield, Utensils } from "lucide-react";

const benefits = [
  {
    icon: MessageCircle,
    title: "Chat-first Tracking",
    description:
      "Ghi chép bữa ăn siêu tốc bằng thao tác chat hoặc gửi hình ảnh. Tạm biệt các ứng dụng truyền thống ép bạn phải tự tìm kiếm và định lượng món ăn rườm rà.",
  },
  {
    icon: Utensils,
    title: "AI am hiểu Món Việt",
    description:
      "Nhận diện chính xác từ phở bò, bún riêu đến cơm tấm. Ước lượng khẩu phần sát thực tế so với các công cụ track thụ động, cơ học.",
  },
  {
    icon: PieChart,
    title: "Dashboard đọc nhanh",
    description:
      "Trực quan hóa quá trình ăn uống. Từ tổng nạp hôm nay đến báo cáo trung bình tuần, dữ liệu được hiển thị sinh động, dễ đọc và đủ sâu khi bạn cần xem kỹ.",
  },
  {
    icon: Bell,
    title: "Cá nhân hóa mục tiêu",
    description:
      "Tùy chỉnh linh hoạt chế độ ăn của riêng bạn (Tăng cơ, Giảm mỡ, Giữ dáng). AI sẽ tự động phân bổ lại lượng Calories và tỷ lệ Macro lý tưởng nhất.",
  },
  {
    icon: CreditCard,
    title: "Luôn luôn Đồng bộ",
    description:
      "Mọi dữ liệu cá nhân của bạn được lưu trữ và cập nhật realtime trên tài khoản. Log bữa ăn khi đang đi ngoài đường, xem lại cặn kẽ biểu đồ khi về nhà.",
  },
  {
    icon: Shield,
    title: "Tối ưu Zalo hoạt động",
    description:
      "Trải nghiệm trên Zalo được tối ưu hóa đặc biệt với các chức năng mở rộng như chế độ Tracking cơ bản, Nutrition chuyên sâu và cả Gym mode.",
  },
];

export const Benefits = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Tính năng trọn vẹn để <span className="text-gradient-primary">làm chủ vóc dáng</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Từ việc đếm calo siêu tốc qua hình ảnh nền tảng chat đến các bản báo cáo Macro nâng cao, hệ sinh thái CaloTrack cung cấp đầy đủ công cụ thân thiện để giúp bạn chinh phục mọi mục tiêu sức khỏe.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card-base group p-6 transition-all hover:-translate-y-1 hover:shadow-elegant"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{benefit.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
