"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { demoState, type PortalState } from "@/lib/portal-data";

type Toast = { id: number; message: string; tone: "success" | "info" | "warning" };

type PortalContextValue = {
  state: PortalState;
  loading: boolean;
  toasts: Toast[];
  refresh: (memberId?: string) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
  addWater: (amount?: number) => void;
  toggleMeal: (id: string) => void;
  checkIn: () => void;
  saveBodyMetric: (metric: { weight: number; bodyFat: number; muscle: number; waist: number }) => void;
  updateBooking: (id: string) => void;
  updateSuggestion: (id: string, status: "已发送" | "待确认" | "草稿") => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

async function persist(action: string, payload: Record<string, unknown>) {
  try {
    await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    // UI remains usable in offline/demo mode. The next successful action syncs normally.
  }
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PortalState>(demoState);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async (memberId?: string) => {
    setLoading(true);
    try {
      const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";
      const response = await fetch(`/api/data${query}`, { credentials: "include" });
      if (!response.ok) return;
      const result = await response.json() as { state?: PortalState };
      if (result.state) setState(result.state);
    } catch {
      // Keep the last usable state when the network is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = Date.now();
      setToasts((items) => [...items, { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== id));
      }, 3200);
    },
    [],
  );

  const addWater = useCallback(
    (amount = 250) => {
      setState((current) => ({
        ...current,
        waterMl: Math.min(3500, current.waterMl + amount),
      }));
      void persist("water", { amount });
      notify(`已记录 ${amount} ml 饮水`);
    },
    [notify],
  );

  const toggleMeal = useCallback(
    (id: string) => {
      setState((current) => ({
        ...current,
        meals: current.meals.map((meal) =>
          meal.id === id ? { ...meal, completed: !meal.completed } : meal,
        ),
      }));
      void persist("meal", { id });
      notify("用餐记录已更新");
    },
    [notify],
  );

  const checkIn = useCallback(() => {
    const today = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Shanghai",
    })
      .format(new Date())
      .replace("-", "/");
    setState((current) => {
      if (current.checkinDates.includes(today)) return current;
      return {
        ...current,
        checkinDates: [...current.checkinDates, today],
        streak: current.streak + 1,
      };
    });
    void persist("checkin", { date: today });
    notify("今日打卡成功，继续保持！");
  }, [notify]);

  const saveBodyMetric = useCallback(
    (metric: { weight: number; bodyFat: number; muscle: number; waist: number }) => {
      const date = new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      })
        .format(new Date())
        .replace("-", "/");
      const item = { id: `m-${Date.now()}`, date, ...metric };
      setState((current) => ({
        ...current,
        bodyMetrics: [...current.bodyMetrics, item],
      }));
      void persist("body", item);
      notify("身体数据已保存");
    },
    [notify],
  );

  const updateBooking = useCallback(
    (id: string) => {
      setState((current) => ({
        ...current,
        bookings: current.bookings.map((booking) =>
          booking.id === id
            ? {
                ...booking,
                status: booking.status === "可预约" ? "已预约" : "已取消",
              }
            : booking,
        ),
      }));
      void persist("booking", { id });
      notify("预约状态已更新");
    },
    [notify],
  );

  const updateSuggestion = useCallback(
    (id: string, status: "已发送" | "待确认" | "草稿") => {
      setState((current) => ({
        ...current,
        suggestions: current.suggestions.map((suggestion) =>
          suggestion.id === id ? { ...suggestion, status } : suggestion,
        ),
      }));
      void persist("suggestion", { id, status });
      notify(status === "已发送" ? "建议已交给 Hermes 推送" : "建议状态已保存");
    },
    [notify],
  );

  const value = useMemo(
    () => ({
      state,
      loading,
      toasts,
      refresh,
      notify,
      addWater,
      toggleMeal,
      checkIn,
      saveBodyMetric,
      updateBooking,
      updateSuggestion,
    }),
    [
      state,
      loading,
      toasts,
      refresh,
      notify,
      addWater,
      toggleMeal,
      checkIn,
      saveBodyMetric,
      updateBooking,
      updateSuggestion,
    ],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal must be used inside PortalProvider");
  return value;
}
