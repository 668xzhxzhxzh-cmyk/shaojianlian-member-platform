"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  demoState,
  type BodyFeedback,
  type Booking,
  type NutritionPlan,
  type PortalState,
  type TrainingPlan,
} from "@/lib/portal-data";

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
  addCoachBooking: (booking: Omit<Booking, "id">) => void;
  deleteCoachBooking: (id: string) => void;
  saveTrainingPlan: (plan: TrainingPlan) => void;
  saveNutritionPlan: (plan: NutritionPlan) => void;
  saveBodyFeedback: (feedback: Omit<BodyFeedback, "id" | "date">) => void;
  updateMemberProfile: (profile: Partial<PortalState["profile"]>) => void;
  updateSuggestion: (id: string, status: "已发送" | "待确认" | "草稿") => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

async function persist(action: string, payload: Record<string, unknown>) {
  try {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || "数据保存失败");
    }
    return await response.json().catch(() => ({}));
  } catch {
    // UI remains usable in offline/demo mode. The next successful action syncs normally.
    return null;
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

  const addCoachBooking = useCallback(
    (booking: Omit<Booking, "id">) => {
      const item: Booking = { ...booking, id: `booking-${Date.now()}` };
      setState((current) => ({
        ...current,
        bookings: [...current.bookings, item],
      }));
      void persist("coach_booking_add", { member_id: state.profile.id, booking: item });
      notify(`${booking.date} ${booking.time} 的私教课已加入排期`);
    },
    [notify, state.profile.id],
  );

  const deleteCoachBooking = useCallback(
    (id: string) => {
      setState((current) => ({
        ...current,
        bookings: current.bookings.filter((booking) => booking.id !== id),
      }));
      void persist("coach_booking_delete", { member_id: state.profile.id, id });
      notify("该节私教课已从排期删除");
    },
    [notify, state.profile.id],
  );

  const saveTrainingPlan = useCallback(
    (plan: TrainingPlan) => {
      setState((current) => ({ ...current, trainingPlan: plan }));
      void persist("coach_training_plan", { member_id: state.profile.id, plan });
      notify(`${state.profile.name} 的训练方案已保存并发布`);
    },
    [notify, state.profile.id, state.profile.name],
  );

  const saveNutritionPlan = useCallback(
    (plan: NutritionPlan) => {
      setState((current) => ({ ...current, nutritionPlan: plan }));
      void persist("coach_nutrition_plan", { member_id: state.profile.id, plan });
      notify(`${state.profile.name} 的饮食方案已保存并发布`);
    },
    [notify, state.profile.id, state.profile.name],
  );

  const saveBodyFeedback = useCallback(
    (feedback: Omit<BodyFeedback, "id" | "date">) => {
      const item: BodyFeedback = {
        ...feedback,
        id: `feedback-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
      };
      setState((current) => ({ ...current, bodyFeedbacks: [...(current.bodyFeedbacks ?? []), item] }));
      void persist("coach_body_feedback", { member_id: state.profile.id, feedback: item });
      notify(`${state.profile.name} 的身体反馈已保存并发布`);
    },
    [notify, state.profile.id, state.profile.name],
  );

  const updateMemberProfile = useCallback(
    (profile: Partial<PortalState["profile"]>) => {
      setState((current) => ({ ...current, profile: { ...current.profile, ...profile } }));
      void persist("coach_member_profile", { member_id: state.profile.id, profile });
      notify("会员档案已更新");
    },
    [notify, state.profile.id],
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
      addCoachBooking,
      deleteCoachBooking,
      saveTrainingPlan,
      saveNutritionPlan,
      saveBodyFeedback,
      updateMemberProfile,
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
      addCoachBooking,
      deleteCoachBooking,
      saveTrainingPlan,
      saveNutritionPlan,
      saveBodyFeedback,
      updateMemberProfile,
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
