"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Camera, MessageSquare, PieChart } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: 'Nhan "bat dau"',
    description: "Nhan \"bat dau\" tren Telegram de hoan tat onboarding va lay BMR / TDEE lam moc theo doi.",
    color: "primary",
  },
  {
    number: "02",
    icon: Camera,
    title: "Gui anh hoac nhap nhanh",
    description: 'Gui anh bua an hoac nhap nhanh kieu "com tam 250g", "1 lon bia Sai Gon", "200g uc ga".',
    color: "flame",
  },
  {
    number: "03",
    icon: PieChart,
    title: "Nhan ket qua va log",
    description: 'Bot tinh kcal / macro, cho sua nhanh neu can, sau do tra loi theo context nhu "con lai hom nay".',
    color: "primary",
  },
];

const commands = [
  "pho bo 1 to",
  "1 lon bia Sai Gon",
  "con lai hom nay",
  "/mode giam mo",
  "/clear",
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
            Chi <span className="text-gradient-primary">3 buoc</span> la bat dau
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Phase 1 cua CaloTrack la Telegram-first: bot la san pham chinh, web la
            lop acquisition, pricing, payment va admin.
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
          <p className="mb-4 text-sm text-muted-foreground">Lenh nhanh thuong dung:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {commands.map((cmd, index) => (
              <motion.span
                key={cmd}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.6 + index * 0.1 }}
                className="rounded-full bg-muted px-4 py-2 font-mono text-sm text-foreground"
              >
                {cmd}
              </motion.span>
            ))}
          </div>
          <p className="mt-6 text-xs italic text-muted-foreground">
            Sai mon? Ban sua nhanh trong chat. Bot uu tien follow-up intent va context gan nhat.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
