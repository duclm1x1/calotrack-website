"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Command, Activity, Dumbbell, UserCog } from "lucide-react";

const commandGroups = [
  {
    icon: Activity,
    title: "Theo dõi nhanh",
    color: "from-primary/80 to-primary",
    commands: [
      { cmd: "/stats", desc: "dashboard hôm nay" },
      { cmd: "/daily", desc: "dashboard ngày hợp nhất" },
      { cmd: "/tuannay", desc: "xem 7 ngày gần nhất" },
      { cmd: "/thangnay", desc: "xem từ đầu tháng" },
    ],
  },
  {
    icon: Command,
    title: "Ghi món",
    color: "from-accent/80 to-accent",
    commands: [
      { cmd: "/log [món]", desc: "ghi nhận món nhanh" },
      { cmd: "[Gửi ảnh]", desc: "nhận review & lưu lại" },
    ],
  },
  {
    icon: UserCog,
    title: "Hồ sơ và tiến độ",
    color: "from-blue-500 to-blue-700",
    commands: [
      { cmd: "/can [số kg]", desc: "cập nhật cân nặng" },
      { cmd: "/mode giammo", desc: "chuyển đổi mục tiêu" },
    ],
  },
  {
    icon: Dumbbell,
    title: "Gym mode",
    color: "from-slate-700 to-slate-900",
    commands: [
      { cmd: "/gym on", desc: "bật chế độ gym" },
      { cmd: "/gym plan 45", desc: "thiết lập bài tập 45p" },
      { cmd: "/gym finish", desc: "kết thúc buổi tập" },
    ],
  },
];

export const UseCases = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <p className="tagline mb-3 justify-center">Lệnh nhanh chóng</p>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Sản phẩm thật, <span className="text-gradient-primary">tính năng thật</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Hệ thống nhận diện lệnh thiết kế riêng để tối giản thời gian thao tác. Không cần menu phức tạp, gửi lệnh là có kết quả liền tay.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {commandGroups.map((group, index) => {
            const Icon = group.icon;
            return (
              <motion.div
                key={group.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="card-base group overflow-hidden border-t-4 hover:shadow-elegant"
                style={{ borderTopColor: index % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--accent))" }}
              >
                <div className="bg-muted/30 p-5 px-6 pb-4 border-b border-border flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${group.color}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">{group.title}</h3>
                </div>
                
                <div className="p-6">
                  <ul className="space-y-4">
                    {group.commands.map((cmd) => (
                      <li key={cmd.cmd} className="flex flex-col gap-1">
                        <code className="w-fit rounded-lg bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                          {cmd.cmd}
                        </code>
                        <span className="text-sm text-muted-foreground">{cmd.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
