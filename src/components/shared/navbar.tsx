"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROUTES, APP_NAME } from "@/lib/constants";

/**
 * Main navigation bar for public pages
 */
export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-zinc-950">C</span>
          </div>
          <span className="text-lg font-semibold text-foreground">{APP_NAME}</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-6 md:flex">
          <Link 
            href={ROUTES.HOME} 
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Trang chủ
          </Link>
          <Link 
            href="#pricing" 
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Bảng giá
          </Link>
          <Link 
            href="#features" 
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Tính năng
          </Link>
        </div>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          <Link href={ROUTES.LOGIN}>
            <Button variant="ghost" size="sm">
              Đăng nhập
            </Button>
          </Link>
          <Link href={ROUTES.REGISTER}>
            <Button size="sm">
              Dùng thử miễn phí
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
