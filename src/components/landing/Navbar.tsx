"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, MessageCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/siteConfig";

const logoSquare = "/logo-square.jpg";

const navLinks = [
  { label: "Cach hoat dong", href: "#how-it-works" },
  { label: "Tinh nang", href: "#benefits" },
  { label: "Bang gia", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          isScrolled ? "bg-background/95 py-3 shadow-soft backdrop-blur-md" : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-4 lg:px-8">
          <nav className="flex items-center justify-between">
            <motion.a
              href="#"
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <img src={logoSquare} alt="CaloTrack" className="h-10 w-10 rounded-xl object-cover" />
              <div>
                <span className="text-xl font-bold text-foreground">CaloTrack</span>
                <p className="text-xs text-muted-foreground">Telegram-first nutrition SaaS</p>
              </div>
            </motion.a>

            <div className="hidden items-center gap-8 md:flex">
              {navLinks.map((link) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                  whileHover={{ y: -2 }}
                >
                  {link.label}
                </motion.a>
              ))}
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <Button variant="outline" asChild>
                <a href="/login">Dang nhap</a>
              </Button>
              <Button asChild className="gap-2 bg-[#229ED9] text-white hover:bg-[#1d90c4]">
                <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Dung tren Telegram
                </a>
              </Button>
            </div>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMobileMenuOpen((value) => !value)}
              className="p-2 text-foreground md:hidden"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </motion.button>
          </nav>
        </div>
      </motion.header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[72px] z-40 border-b border-border bg-background/98 backdrop-blur-lg md:hidden"
          >
            <div className="container mx-auto px-4 py-6">
              <div className="flex flex-col gap-4">
                {navLinks.map((link, index) => (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="py-2 text-lg font-medium text-foreground transition-colors hover:text-primary"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </motion.a>
                ))}

                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <Button asChild variant="outline" className="w-full">
                    <a href="/login">Dang nhap</a>
                  </Button>
                  <Button asChild className="w-full gap-2 bg-[#229ED9] text-white hover:bg-[#1d90c4]">
                    <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      Dung tren Telegram
                    </a>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {SITE_CONFIG.secondaryChannelLabel} dang o {SITE_CONFIG.secondaryChannelStatus.toLowerCase()}.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
