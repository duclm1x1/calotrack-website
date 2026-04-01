"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { SITE_CONFIG, buildSiteUrl } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

export default function AdminLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(SITE_CONFIG.adminPath, { replace: true });
    }
  }, [navigate, user]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: buildSiteUrl(SITE_CONFIG.adminPath),
        },
      });

      if (error) {
        throw error;
      }

      toast.success("Đã gửi email đăng nhập admin. Kiểm tra Inbox, Spam hoặc Promotions để mở backoffice.");
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể gửi email đăng nhập admin."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-[32px] border border-primary/10 bg-white/88 p-8 shadow-md backdrop-blur">
        <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          Admin auth
        </div>

        <form onSubmit={handleLogin} className="mt-4 rounded-[28px] border border-primary/10 bg-primary/5 p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            Backoffice gate
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Admin email</label>
            <Input
              type="email"
              placeholder="admin@calotrack.vn"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="mt-4 rounded-2xl border border-primary/10 bg-white/80 p-4 text-sm leading-6 text-muted-foreground">
            Email đăng nhập sẽ được gửi về hòm thư, hãy xác nhận để được vào backoffice.
          </div>
          <Button type="submit" className="mt-4 w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Gửi email đăng nhập admin
          </Button>
        </form>
      </div>
    </div>
  );
}
