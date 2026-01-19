"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const logoSquare = "/logo-square.jpg";

const footerLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Contact", href: "mailto:support@calotrack.vn" },
];

export const Footer = () => {
  return (
    <footer className="bg-muted/50 border-t border-border">
      <div className="container mx-auto px-4 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.02 }} className="flex items-center gap-3">
              <img src={logoSquare} alt="CaloTrack" className="w-8 h-8 rounded-lg object-cover" />
              <span className="text-lg font-bold text-foreground">CaloTrack</span>
            </motion.div>
          </Link>
          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</a>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} CaloTrack</p>
        </div>
      </div>
    </footer>
  );
};
