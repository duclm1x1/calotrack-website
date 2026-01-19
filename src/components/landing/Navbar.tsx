import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSquare from "@/assets/logo-square.jpg";

const navLinks = [
  { label: "Cách hoạt động", href: "#how-it-works" },
  { label: "Tính năng", href: "#benefits" },
  { label: "Bảng giá", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-background/95 backdrop-blur-md shadow-soft py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-4 lg:px-8">
          <nav className="flex items-center justify-between">
            <motion.a href="#" className="flex items-center gap-3" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <img src={logoSquare} alt="CaloTrack" className="w-10 h-10 rounded-xl object-cover" />
              <span className="text-xl font-bold text-foreground">CaloTrack</span>
            </motion.a>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <motion.a key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" whileHover={{ y: -2 }}>
                  {link.label}
                </motion.a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button asChild className="bg-[#0068FF] hover:bg-[#0052CC] text-white gap-2">
                <a href="https://zalo.me/your-oa-id" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4" />
                  Chat trên Zalo
                </a>
              </Button>
            </div>

            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-foreground" aria-label="Toggle menu">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </motion.button>
          </nav>
        </div>
      </motion.header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }} className="fixed inset-x-0 top-[72px] z-40 bg-background/98 backdrop-blur-lg border-b border-border md:hidden">
            <div className="container mx-auto px-4 py-6">
              <div className="flex flex-col gap-4">
                {navLinks.map((link, index) => (
                  <motion.a key={link.href} href={link.href} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="text-lg font-medium text-foreground hover:text-primary transition-colors py-2" onClick={() => setIsMobileMenuOpen(false)}>
                    {link.label}
                  </motion.a>
                ))}
                <div className="pt-4 border-t border-border flex flex-col gap-3">
                  <Button asChild className="w-full bg-[#0068FF] hover:bg-[#0052CC] text-white gap-2">
                    <a href="https://zalo.me/your-oa-id" target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4" />
                      Chat trên Zalo
                    </a>
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">Gửi ảnh bữa gần nhất để thử</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
