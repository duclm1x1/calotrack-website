"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Compass, MessageCircle, MonitorSmartphone } from "lucide-react";

const values = [
  {
    icon: MessageCircle,
    title: "Telegram live now",
    description:
      "Tracking bữa ăn, image review, stats và các flow sửa log hiện đang mạnh nhất trên Telegram. Đây là nơi người dùng dùng sản phẩm mỗi ngày.",
    color: "from-primary/80 to-primary",
  },
  {
    icon: Compass,
    title: "Zalo next channel",
    description:
      "Website và data model đã được dọn để khi Zalo workflow riêng trong n8n sẵn sàng, frontend không cần đổi lại cách kể chuyện hay cấu trúc account.",
    color: "from-accent/80 to-accent",
  },
  {
    icon: MonitorSmartphone,
    title: "Portal and backoffice",
    description:
      "Portal web gom pricing, login, billing, dashboard và admin vận hành. Đây là phần giúp CaloTrack đi từ bot sang SaaS thật.",
    color: "from-slate-700 to-slate-900",
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
            Ba lớp sản phẩm <span className="text-gradient-primary">đi cùng nhau</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            CaloTrack không cố biến mọi thứ thành một web app thuần. Sản phẩm được chia rõ thành layer chat,
            layer portal và layer vận hành để mỗi phần làm đúng việc của nó.
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
            “Tracking nên diễn ra ở nơi người dùng thấy tự nhiên nhất, còn website nên làm tốt phần tin cậy,
            account, money và backoffice. Đó là cách CaloTrack đi từ bot sang SaaS.”
          </p>
        </motion.blockquote>
      </div>
    </section>
  );
};
