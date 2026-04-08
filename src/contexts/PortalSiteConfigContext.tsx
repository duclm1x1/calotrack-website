import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  applyPortalSiteConfigOverrides,
  getPortalSiteConfigSnapshot,
  type PortalSiteConfigOverrides,
} from "@/lib/siteConfig";

type PortalSiteConfigContextValue = {
  siteConfig: ReturnType<typeof getPortalSiteConfigSnapshot>;
  loading: boolean;
  updatedAt: string | null;
  refresh: () => Promise<void>;
};

const PortalSiteConfigContext = createContext<PortalSiteConfigContextValue>({
  siteConfig: getPortalSiteConfigSnapshot(),
  loading: true,
  updatedAt: null,
  refresh: async () => {},
});

type PublicSiteConfigResponse = {
  settings?: PortalSiteConfigOverrides | null;
  updatedAt?: string | null;
};

export function PortalSiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [siteConfig, setSiteConfig] = useState(() => getPortalSiteConfigSnapshot());
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/public-site-config", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: PublicSiteConfigResponse }
        | null;

      if (response.ok && payload?.ok !== false) {
        applyPortalSiteConfigOverrides(payload?.data?.settings ?? null);
        setUpdatedAt(payload?.data?.updatedAt ?? null);
      }
    } catch {
      // Keep env defaults if public runtime config is unavailable.
    } finally {
      setSiteConfig(getPortalSiteConfigSnapshot());
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo(
    () => ({
      siteConfig,
      loading,
      updatedAt,
      refresh,
    }),
    [siteConfig, loading, updatedAt],
  );

  return (
    <PortalSiteConfigContext.Provider value={value}>
      {children}
    </PortalSiteConfigContext.Provider>
  );
}

export function usePortalSiteConfig() {
  return useContext(PortalSiteConfigContext);
}
