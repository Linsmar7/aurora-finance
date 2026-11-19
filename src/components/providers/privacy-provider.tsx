"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { formatCurrency as baseFormatCurrency } from "@/lib/utils";

interface PrivacyContextType {
  hideValues: boolean;
  toggleHideValues: () => void;
  formatMoney: (
    cents: number,
    options?: { showPlus?: boolean; abs?: boolean }
  ) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  hideValues: false,
  toggleHideValues: () => {},
  formatMoney: (cents, opts) => baseFormatCurrency(cents, opts),
});

const STORAGE_KEY = "aurora_privacy_mode";

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hideValues, setHideValues] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") {
        setHideValues(true);
        document.documentElement.classList.add("privacy-mode");
      }
    } catch {
      // Ignora erro em ambientes sem localStorage
    }
  }, []);

  const toggleHideValues = useCallback(() => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignora
      }
      if (next) {
        document.documentElement.classList.add("privacy-mode");
      } else {
        document.documentElement.classList.remove("privacy-mode");
      }
      return next;
    });
  }, []);

  // Atalho de teclado: Alt+H ou Ctrl+H para alternar privacidade rapidamente
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        toggleHideValues();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleHideValues]);

  const formatMoney = useCallback(
    (cents: number, options?: { showPlus?: boolean; abs?: boolean }) => {
      if (isMounted && hideValues) {
        if (options?.showPlus && cents > 0) return "+R$ •••••";
        if (cents < 0 && !options?.abs) return "-R$ •••••";
        return "R$ •••••";
      }
      return baseFormatCurrency(cents, options);
    },
    [hideValues, isMounted]
  );

  const value = useMemo(
    () => ({
      hideValues: isMounted ? hideValues : false,
      toggleHideValues,
      formatMoney,
    }),
    [hideValues, isMounted, toggleHideValues, formatMoney]
  );

  return (
    <PrivacyContext.Provider value={value}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

