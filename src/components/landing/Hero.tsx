import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MessageCircle, Play, Check, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo3d from "@/assets/logo-3d.png";

export const Hero = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const logoRotate = useTransform(scrollYProgress, [0, 1], [0, 15]);
  const logoScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  const bullets = [
    "Món Việt + ước lượng khẩu phần sát thực tế",
    "Hỏi \"còn lại?\" ra ngay ngân sách kcal trong ngày",
    "21:00 tổng kết & nhắc nhẹ theo thói quen",
  ];

  return (
    <section ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <motion.div className="absolute top-1/4 left-[10%] w-64 h-64 bg-primary/10 rounded-full blur-3xl" animate={{ y: [0, 30, 0], x: [0, 15, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute bottom-1/4 right-[10%] w-80 h-80 bg-flame/10 rounded-full blur-3xl" animate={{ y: [0, -25, 0], x: [0, -20, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: "easeOut" }} className="text-center lg:text-left">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-medium text-primary">Trợ lý dinh dưỡng AI qua chat</span>
            </motion.div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight mb-6">
              <span className="text-foreground">Gửi ảnh món ăn → biết </span>
              <span className="text-gradient-primary">kcal/macro</span>
              <span className="text-foreground"> trong </span>
              <span className="text-flame">20 giây</span>
              <br />
              <span className="inline-flex items-center gap-3 mt-2">
                <span className="text-foreground">ngay trên</span>
                <span className="inline-flex items-center gap-2 text-[#0068FF]">
                  <svg className="w-10 h-10 lg:w-12 lg:h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 4C12.954 4 4 12.954 4 24C4 35.046 12.954 44 24 44C35.046 44 44 35.046 44 24C44 12.954 35.046 4 24 4Z" fill="#0068FF"/>
                    <path d="M33.5 18.5C33.5 14.358 29.194 11 24 11C18.806 11 14.5 14.358 14.5 18.5C14.5 22.194 17.888 25.278 22.5 25.875V28.5L25.5 25.5C29.806 25.028 33.5 22.028 33.5 18.5Z" fill="white"/>
                    <path d="M24 32C27.314 32 30 30.657 30 29C30 27.343 27.314 26 24 26C20.686 26 18 27.343 18 29C18 30.657 20.686 32 24 32Z" fill="white"/>
                    <path d="M18.5 21.5L21 19L19 17L21.5 15" stroke="#0068FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M26.5 15L29 17L27 19L29.5 21.5" stroke="#0068FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Zalo
                </span>
              </span>
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
              CaloTrack là trợ lý dinh dưỡng qua chat (Zalo/Telegram). Nhắn ảnh hoặc "món + gram" để theo dõi calo chuẩn món Việt — không cần đếm tay.
            </p>

            <ul className="space-y-3 mb-8">
              {bullets.map((bullet, index) => (
                <motion.li key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.1 }} className="flex items-start gap-3 text-left">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </span>
                  <span className="text-muted-foreground">{bullet}</span>
                </motion.li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
              <Button size="lg" asChild className="w-full sm:w-auto bg-[#0068FF] hover:bg-[#0052CC] text-white gap-2 text-base px-8 py-6">
                <a href="https://zalo.me/your-oa-id" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-5 h-5" />
                  Chat trên Zalo
                </a>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 text-base px-8 py-6" asChild>
                <a href="#demo"><Play className="w-4 h-4" />Xem demo chat 20s</a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">Mở Zalo → tìm "CaloTrack OA" → gửi "bắt đầu" hoặc gửi ảnh bữa ăn</p>
            <p className="text-xs text-muted-foreground/70 italic">Không thay thế tư vấn y khoa. Bạn luôn có thể sửa và xóa dữ liệu bất cứ lúc nào.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }} className="relative flex items-center justify-center">
            {/* Background glow */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div 
                className="w-80 h-80 md:w-96 md:h-96 bg-gradient-to-br from-primary/40 to-flame/30 rounded-full blur-3xl"
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            {/* Gradient flow ring */}
            <div className="absolute w-[22rem] h-[22rem] md:w-[26rem] md:h-[26rem] lg:w-[30rem] lg:h-[30rem]">
              <svg className="w-full h-full" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="gradient-flow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1">
                      <animate attributeName="offset" values="0;1;0" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="50%" stopColor="hsl(var(--flame))" stopOpacity="1">
                      <animate attributeName="offset" values="0.5;1.5;0.5" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1">
                      <animate attributeName="offset" values="1;2;1" dur="3s" repeatCount="indefinite" />
                    </stop>
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <motion.circle
                  cx="100"
                  cy="100"
                  r="95"
                  fill="none"
                  stroke="url(#gradient-flow)"
                  strokeWidth="2"
                  strokeDasharray="15 10"
                  filter="url(#glow)"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "center" }}
                />
              </svg>
            </div>

            {/* Secondary spinning ring */}
            <motion.div 
              className="absolute w-[20rem] h-[20rem] md:w-[24rem] md:h-[24rem] lg:w-[28rem] lg:h-[28rem] rounded-full border border-primary/10"
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            />

            {/* Logo with shimmer effect */}
            <motion.div style={{ rotate: logoRotate, scale: logoScale }} className="relative z-10">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                animate={{ x: ["-200%", "200%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              />
              <motion.img 
                src={logo3d} 
                alt="CaloTrack Logo" 
                className="w-80 h-80 md:w-96 md:h-96 lg:w-[28rem] lg:h-[28rem] object-contain drop-shadow-2xl"
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "drop-shadow(0 0 30px hsl(var(--primary) / 0.4))" }}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>

      <motion.div style={{ opacity }} className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-sm text-muted-foreground">Cuộn xuống</span>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <ArrowDown className="w-5 h-5 text-primary" />
        </motion.div>
      </motion.div>
    </section>
  );
};
