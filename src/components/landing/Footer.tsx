import { motion } from "framer-motion";
import logo3D from "@/assets/logo-3d.png";

const footerLinks = {
  product: {
    title: "Sản phẩm",
    links: [
      { label: "Tính năng", href: "#features" },
      { label: "Bảng giá", href: "#pricing" },
      { label: "Dashboard", href: "#" },
      { label: "Mobile App", href: "#" },
    ],
  },
  company: {
    title: "Công ty",
    links: [
      { label: "Về chúng tôi", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Liên hệ", href: "#contact" },
    ],
  },
  support: {
    title: "Hỗ trợ",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Help Center", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  },
};

export const Footer = () => {
  return (
    <footer className="bg-ink text-white py-16 md:py-20">
      <div className="container-wide mx-auto px-4 md:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <motion.a
              href="#"
              className="flex items-center gap-3 mb-6"
              whileHover={{ scale: 1.02 }}
            >
              <img src={logo3D} alt="CaloTrack" className="h-12 w-12" />
              <span className="text-2xl font-bold">
                <span className="text-teal-light">Calo</span>
                <span className="text-flame-start">Track</span>
              </span>
            </motion.a>
            <p className="text-white/60 mb-6 max-w-sm">
              AI nutrition assistant giúp bạn kiểm soát calo, làm chủ bữa ăn —
              thông qua chat và dashboard thông minh.
            </p>
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} Calo Track. All rights reserved.
            </p>
          </div>

          {/* Links */}
          {Object.values(footerLinks).map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold mb-4 text-white/90">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-white/50 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-white/50 hover:text-white transition-colors text-sm"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-white/50 hover:text-white transition-colors text-sm"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-white/50 hover:text-white transition-colors text-sm"
            >
              Cookies
            </a>
          </div>
          <div className="flex items-center gap-4">
            {/* Social icons placeholder */}
            <span className="text-white/40 text-sm">
              Made with 💚 in Vietnam
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
