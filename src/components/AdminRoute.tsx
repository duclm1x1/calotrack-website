import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { getAdminAccessState } from "@/lib/adminApi";
import { useAuth } from "@/contexts/AuthContext";

export const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    if (loading) {
      return () => {
        active = false;
      };
    }

    if (!user) {
      setIsAdmin(null);
      return () => {
        active = false;
      };
    }

    setIsAdmin(null);
    getAdminAccessState()
      .then((access) => {
        if (active) {
          setIsAdmin(access.isAdmin);
        }
      })
      .catch(() => {
        if (active) {
          setIsAdmin(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loading, user]);

  if (loading || (user && isAdmin === null)) {
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

  if (!user) {
    return <Navigate to="/admin-login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};
