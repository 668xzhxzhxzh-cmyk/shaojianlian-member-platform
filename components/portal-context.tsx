"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  emptyPortalState,
  type BodyFeedback,
  type Booking,
  type NutritionPlan,
  type PortalState,
  type TrainingPlan,
} from "@/lib/portal-data";
import { portalFetch, type SessionRole } from "@/lib/portal-auth";

type Toast = { id: number; message: string; tone: "success" | "info" | "warning" };

type PortalContextValue = {
  role: SessionRole;
  state: PortalState;
  loading: boolean;
  toasts: Toast[];
  refresh: (memberId?: string) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
  addWater: (amount?: number) => void;
  toggleMeal: (id: string) => void;
  checkIn: () => void;
  saveBodyMetric: (metric: { weight: number; bodyFat: number; muscle: number; waist: number }) => void;
  addCoachBooking: (booking: Omit<Booking, "id">, memberId?: string) => void;
  deleteCoachBooking: (id: string, memberId?: string) => void;
  saveTrainingPlan: (plan: TrainingPlan, memberId?: string) => void;
  saveNutritionPlan: (plan: NutritionPlan, memberId?: string) => void;
  saveBodyFeedback: (feedback: Omit<BodyFeedback, "id" | "date">, memberId?: string) => void;
  updateMemberProfile: (profile: Partial<PortalState["profile"]>, memberId?: string) => void;
  updateSuggestion: (id: string, status: "已发送" | "待确认" | "草稿", options?: { silent?: boolean }) => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

async function persist(role: SessionRole, action: string, payload: Record<string, unknown>) {
  try {
    const response = await portalFetch("/api/actions", role, {
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

export function PortalProvider({ children, role }: { children: React.ReactNode; role: SessionRole }) {
  const [state, setState] = useState<PortalState>(emptyPortalState);
  const [loadedMemberId, setLoadedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = Date.now();
      setToasts([{ id, message, tone }]);
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== id));
      }, 2400);
    },
    [],
  );

  const refresh = useCallback(async (memberId?: string) => {
    setLoading(true);
    try {
      const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";
      const response = await portalFetch(`/api/data${query}`, role);
      if (!response.ok) return;
      const result = await response.json() as { state?: PortalState };
      if (result.state) {
        setState(result.state);
        // 记录当前界面数据属于哪位会员，供教练端写入时核对目标，防止错绑。
        const loadedId = String(result.state.profile?.id || memberId || "");
        setLoadedMemberId(loadedId || null);
      }
    } catch {
      // Keep the last usable state when the network is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, [role]);

  // 教练端写入前校验：必须已显式选中会员，且当前界面数据确实属于该会员。
  const requireCoachTarget = useCallback(
    (memberId?: string): string | null => {
      if (role !== "coach") return String(memberId ?? loadedMemberId ?? (state.profile.id || ""));
      const target = String(memberId ?? "");
      if (!target) {
        notify("请先选择会员", "warning");
        return null;
      }
      if (target !== loadedMemberId) {
        notify("会员数据尚未加载完成，请稍候再保存", "warning");
        return null;
      }
      return target;
    },
    [role, loadedMemberId, state.profile.id, notify],
  );

  const addWater = useCallback(
    (amount = 250) => {
      setState((current) => ({
        ...current,
        waterMl: Math.min(3500, current.waterMl + amount),
      }));
      void persist(role, "water", { amount });
      notify(`已记录 ${amount} ml 饮水`);
    },
    [notify, role],
  );

  const toggleMeal = useCallback(
    (id: string) => {
      setState((current) => ({
        ...current,
        meals: current.meals.map((meal) =>
          meal.id === id ? { ...meal, completed: !meal.completed } : meal,
        ),
      }));
      void persist(role, "meal", { id });
      notify("用餐记录已更新");
    },
    [notify, role],
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
    void persist(role, "checkin", { date: today });
    notify("今日打卡成功，继续保持！");
  }, [notify, role]);

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
      void persist(role, "body", item);
      notify("身体数据已保存");
    },
    [notify, role],
  );

  const addCoachBooking = useCallback(
    (booking: Omit<Booking, "id">, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      const item: Booking = { ...booking, id: `booking-${Date.now()}` };
      setState((current) => ({
        ...current,
        bookings: [...current.bookings, item],
      }));
      void persist(role, "coach_booking_add", { member_id: target, booking: item });
      notify(`${booking.date} ${booking.time} 的私教课已加入排期`);
    },
    [notify, role, requireCoachTarget],
  );

  const deleteCoachBooking = useCallback(
    (id: string, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      setState((current) => ({
        ...current,
        bookings: current.bookings.filter((booking) => booking.id !== id),
      }));
      void persist(role, "coach_booking_delete", { member_id: target, id });
      notify("该节私教课已从排期删除");
    },
    [notify, role, requireCoachTarget],
  );

  const saveTrainingPlan = useCallback(
    (plan: TrainingPlan, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      setState((current) => ({ ...current, trainingPlan: plan }));
      void persist(role, "coach_training_plan", { member_id: target, plan });
      notify(`${state.profile.name} 的训练方案已保存并发布`);
    },
    [notify, role, requireCoachTarget, state.profile.name],
  );

  const saveNutritionPlan = useCallback(
    (plan: NutritionPlan, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      setState((current) => ({ ...current, nutritionPlan: plan }));
      void persist(role, "coach_nutrition_plan", { member_id: target, plan });
      notify(`${state.profile.name} 的饮食方案已保存并发布`);
    },
    [notify, role, requireCoachTarget, state.profile.name],
  );

  const saveBodyFeedback = useCallback(
    (feedback: Omit<BodyFeedback, "id" | "date">, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      const item: BodyFeedback = {
        ...feedback,
        id: `feedback-${Date.now()}`,
        // 使用中国时区日期，避免凌晨 0-8 点记录被记到前一天。
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      };
      setState((current) => ({ ...current, bodyFeedbacks: [...(current.bodyFeedbacks ?? []), item] }));
      void persist(role, "coach_body_feedback", { member_id: target, feedback: item });
      notify(`${state.profile.name} 的身体反馈已保存并发布`);
    },
    [notify, role, requireCoachTarget, state.profile.name],
  );

  const updateMemberProfile = useCallback(
    (profile: Partial<PortalState["profile"]>, memberId?: string) => {
      const target = requireCoachTarget(memberId);
      if (!target) return;
      setState((current) => ({ ...current, profile: { ...current.profile, ...profile } }));
      void persist(role, "coach_member_profile", { member_id: target, profile });
      notify("会员档案已更新");
    },
    [notify, role, requireCoachTarget],
  );

  const updateSuggestion = useCallback(
    (id: string, status: "已发送" | "待确认" | "草稿", options?: { silent?: boolean }) => {
      // 建议属于当前界面加载的会员数据：必须带上 member_id，避免服务端回落到默认会员。
      const target = String(loadedMemberId ?? (state.profile.id || ""));
      if (!target) {
        notify("暂无会员数据可操作", "warning");
        return;
      }
      setState((current) => ({
        ...current,
        suggestions: current.suggestions.map((suggestion) =>
          suggestion.id === id ? { ...suggestion, status } : suggestion,
        ),
      }));
      void persist(role, "suggestion", { member_id: target, id, status });
      if (!options?.silent) notify(status === "已发送" ? "发送任务已创建，请在企业微信客户端确认发送。" : "建议状态已更新");
    },
    [notify, role, loadedMemberId, state.profile.id],
  );

  const value = useMemo(
    () => ({
      role,
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
      role,
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
