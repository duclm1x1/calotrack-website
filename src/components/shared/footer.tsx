import Link from "next/link";
import { ROUTES, APP_NAME } from "@/lib/constants";

/**
 * Footer component for all pages
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-zinc-950">C</span>
              </div>
              <span className="text-lg font-semibold text-foreground">{APP_NAME}</span>
            </div>
            <p className="text-sm text-muted max-w-xs">
              Theo dõi Calo bằng AI. Chụp ảnh đồ ăn, nhận kết quả phân tích trong 2 giây.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Sản phẩm</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#features" className="text-sm text-muted hover:text-foreground transition-colors">
                  Tính năng
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="text-sm text-muted hover:text-foreground transition-colors">
                  Bảng giá
                </Link>
              </li>
              <li>
                <Link href="#faq" className="text-sm text-muted hover:text-foreground transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Pháp lý</h3>
            <ul className="space-y-2">
              <li>
                <Link href={ROUTES.PRIVACY} className="text-sm text-muted hover:text-foreground transition-colors">
                  Chính sách bảo mật
                </Link>
              </li>
              <li>
                <Link href={ROUTES.TERMS} className="text-sm text-muted hover:text-foreground transition-colors">
                  Điều khoản sử dụng
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-zinc-800">
          <p className="text-center text-sm text-muted">
            © {currentYear} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
