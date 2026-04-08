import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { getAdminAccessState } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  const { user, loading, networkError } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (loading) {
      return () => {
        active = false;
      };
    }

    if (!user) {
      setIsAdmin(null);
      setGateError(null);
      return () => {
        active = false;
      };
    }

    setIsAdmin(null);
    setGateError(null);
    
    const timeoutId = setTimeout(() => {
      if (active) {
        setGateError("Yêu cầu quá hạn. Backend phản hồi chậm hoặc đang bảo trì.");
        setIsAdmin(null);
      }
    }, 7000);
    getAdminAccessState()
      .then((access) => {
        if (active) {
          setIsAdmin(access.isAdmin);
        }
      })
      .catch((error) => {
        if (active) {
          clearTimeout(timeoutId);
          setGateError(
            String(
              (error as Error)?.message ||
                "Không thể kiểm tra quyền quản trị lúc này. Vui lòng thử lại.",
            ),
          );
          setIsAdmin(null);
        }
      })
      .finally(() => {
        if (active) {
          clearTimeout(timeoutId);
        }
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [loading, user?.id]);

  if (loading || (user && isAdmin === null && !networkError && !gateError)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-6">
        <div className="w-full max-w-md rounded-[32px] border border-primary/10 bg-white/85 p-8 text-center shadow-md backdrop-blur">
          <div className="mx-auto mb-4 inline-flex rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Admin gate
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">Đang xác thực quyền quản trị</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            CaloTrack đang kiểm tra session đăng nhập, liên kết `public.users` và quyền `is_admin`.
          </p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (networkError || gateError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-6">
        <div className="w-full max-w-md rounded-[32px] border border-primary/10 bg-white/85 p-8 text-center shadow-md backdrop-blur">
          <div className="mx-auto mb-4 inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-700">
            Admin unavailable
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
            Không thể kiểm tra quyền quản trị
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{gateError || networkError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => window.location.assign("/admin-login")}>
              Về admin login
            </Button>
            <Button onClick={() => window.location.reload()}>Thử lại</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin-login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-6">
        <div className="w-full max-w-md rounded-[32px] border border-primary/10 bg-white/85 p-8 text-center shadow-md backdrop-blur">
          <div className="mx-auto mb-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
            Admin only
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
            Tài khoản này không có quyền quản trị
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Bạn đã đăng nhập nhưng không nằm trong nhóm admin hoặc owner của CaloTrack.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              Về trang chủ
            </Button>
            <Button onClick={() => window.location.assign("/dashboard")}>Mở dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};
