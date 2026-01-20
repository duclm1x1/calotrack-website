"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Admin Layout - Protects admin routes
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Check admin role from user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      setIsAdmin(true);
      setIsLoading(false);
    };

    checkAdmin();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-xl font-bold text-primary">
              🛡️ Admin Panel
            </Link>
            <nav className="hidden md:flex gap-4">
              <Link href="/admin" className="text-sm text-muted hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/admin/pending" className="text-sm text-muted hover:text-foreground">
                Pending Users
              </Link>
            </nav>
          </div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
            ← Back to App
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}