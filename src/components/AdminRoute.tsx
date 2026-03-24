import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { getAdminAccessState } from "@/lib/adminApi";
import { useAuth } from "@/contexts/AuthContext";

/**
 * AdminRoute wraps pages that require DB-backed admin access.
 *
 * Checks:
 * 1. User must be logged in
 * 2. Logged in user must link to public.users.auth_user_id
 * 3. Linked user row must have is_admin = true
 */
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
      <div className="h-screen w-screen flex items-center justify-center text-zinc-500">
        Dang xac thuc...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};
