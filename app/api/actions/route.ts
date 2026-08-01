import { getPortalState, portalUserId, savePortalState } from "@/lib/d1";

export const dynamic = "force-dynamic";

type ActionBody = { action?: string; payload?: Record<string, unknown> };

export async function POST(request: Request) {
  let body: ActionBody;
  try {
    body = await request.json() as ActionBody;
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const action = body.action;
  const payload = body.payload ?? {};
  if (!action) return Response.json({ error: "缺少 action" }, { status: 400 });

  try {
    const state = await getPortalState();
    let db;
    if (action === "water") {
      const amount = Math.min(1000, Math.max(0, Number(payload.amount) || 0));
      state.waterMl = Math.min(3500, state.waterMl + amount);
    } else if (action === "meal") {
      const id = String(payload.id ?? "");
      const meal = state.meals.find((item) => item.id === id);
      if (!meal) return Response.json({ error: "找不到用餐记录" }, { status: 404 });
      meal.completed = !meal.completed;
      db = await savePortalState(state);
      await db.prepare("INSERT INTO nutrition_logs (id, user_id, meal_type, food, calories, protein, completed) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET completed = excluded.completed")
        .bind(meal.id, portalUserId, meal.type, meal.food, meal.calories, meal.protein, meal.completed ? 1 : 0).run();
      return Response.json({ ok: true, state });
    } else if (action === "checkin") {
      const date = String(payload.date ?? "").slice(0, 10);
      if (date && !state.checkinDates.includes(date)) {
        state.checkinDates.push(date);
        state.streak += 1;
      }
      db = await savePortalState(state);
      await db.prepare("INSERT OR IGNORE INTO checkins (user_id, checkin_date) VALUES (?, ?)").bind(portalUserId, date).run();
      return Response.json({ ok: true, state });
    } else if (action === "body") {
      const metric = {
        id: String(payload.id ?? `metric-${Date.now()}`),
        date: String(payload.date ?? "").slice(0, 10),
        weight: Number(payload.weight),
        bodyFat: Number(payload.bodyFat),
        muscle: Number(payload.muscle),
        waist: Number(payload.waist),
      };
      if ([metric.weight, metric.bodyFat, metric.muscle, metric.waist].some((value) => !Number.isFinite(value))) {
        return Response.json({ error: "身体数据不完整" }, { status: 400 });
      }
      state.bodyMetrics.push(metric);
      state.bodyMetrics = state.bodyMetrics.slice(-90);
      db = await savePortalState(state);
      await db.prepare("INSERT OR REPLACE INTO body_metrics (id, user_id, measured_at, weight, body_fat, muscle, waist) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(metric.id, portalUserId, metric.date, metric.weight, metric.bodyFat, metric.muscle, metric.waist).run();
      return Response.json({ ok: true, state });
    } else if (action === "booking") {
      return Response.json({ error: "会员端不提供自行排课，课程由教练统一安排" }, { status: 403 });
    } else if (action === "coach_booking_add") {
      const incoming = payload.booking && typeof payload.booking === "object" ? payload.booking as Record<string, unknown> : {};
      const booking = {
        id: String(incoming.id ?? `booking-${Date.now()}`),
        day: String(incoming.day ?? ""),
        date: String(incoming.date ?? ""),
        time: String(incoming.time ?? ""),
        title: "一对一私教",
        coach: "邵教练",
        focus: String(incoming.focus ?? "一对一私教"),
        status: (["已完成", "已预约", "待确认"].includes(String(incoming.status)) ? String(incoming.status) : "已预约") as "已完成" | "已预约" | "待确认",
      };
      if (!booking.day || !booking.date || !/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(booking.time)) return Response.json({ error: "课程日期或时间无效" }, { status: 400 });
      state.bookings.push(booking);
      db = await savePortalState(state);
      await db.prepare("INSERT INTO bookings (id, user_id, coach_id, title, starts_at, status) VALUES (?, ?, 'coach-shao', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,starts_at=excluded.starts_at,status=excluded.status")
        .bind(booking.id, portalUserId, booking.title, `${booking.date} ${booking.time}`, booking.status).run();
      return Response.json({ ok: true, state });
    } else if (action === "coach_booking_delete") {
      const id = String(payload.id ?? "");
      if (!state.bookings.some((item) => item.id === id)) return Response.json({ error: "找不到该课程" }, { status: 404 });
      state.bookings = state.bookings.filter((item) => item.id !== id);
      db = await savePortalState(state);
      await db.prepare("DELETE FROM bookings WHERE id = ?").bind(id).run();
      return Response.json({ ok: true, state });
    } else if (action === "coach_training_plan") {
      const plan = payload.plan;
      if (!plan || typeof plan !== "object" || !Array.isArray((plan as { days?: unknown }).days)) return Response.json({ error: "训练方案格式无效" }, { status: 400 });
      state.trainingPlan = plan as typeof state.trainingPlan;
    } else if (action === "coach_nutrition_plan") {
      const plan = payload.plan;
      if (!plan || typeof plan !== "object" || !Array.isArray((plan as { meals?: unknown }).meals)) return Response.json({ error: "饮食方案格式无效" }, { status: 400 });
      state.nutritionPlan = plan as typeof state.nutritionPlan;
    } else if (action === "coach_body_feedback") {
      const feedback = payload.feedback;
      if (!feedback || typeof feedback !== "object") return Response.json({ error: "身体反馈格式无效" }, { status: 400 });
      state.bodyFeedbacks = [...(state.bodyFeedbacks ?? []), feedback as typeof state.bodyFeedbacks[number]].slice(-100);
    } else if (action === "coach_member_profile") {
      const profile = payload.profile && typeof payload.profile === "object" ? payload.profile as Record<string, unknown> : {};
      for (const key of ["plan", "expiresAt", "level"] as const) {
        if (typeof profile[key] === "string" && profile[key]) state.profile[key] = String(profile[key]).slice(0, 120);
      }
    } else if (action === "suggestion") {
      const id = String(payload.id ?? "");
      const status = String(payload.status ?? "");
      const suggestion = state.suggestions.find((item) => item.id === id);
      if (!suggestion || !["已发送", "待确认", "草稿"].includes(status)) return Response.json({ error: "建议状态无效" }, { status: 400 });
      suggestion.status = status as typeof suggestion.status;
      db = await savePortalState(state);
      await db.prepare("INSERT INTO ai_suggestions (id, member_id, coach_id, category, title, content, status, confirmed_at) VALUES (?, ?, 'coach-shao', ?, ?, ?, ?, CASE WHEN ? = '已发送' THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(id) DO UPDATE SET status = excluded.status, confirmed_at = excluded.confirmed_at")
        .bind(suggestion.id, portalUserId, suggestion.category, suggestion.title, suggestion.content, suggestion.status, suggestion.status).run();
      return Response.json({ ok: true, state });
    } else {
      return Response.json({ error: "不支持的操作" }, { status: 400 });
    }
    await savePortalState(state);
    return Response.json({ ok: true, state });
  } catch {
    return Response.json({ error: "数据暂时无法保存" }, { status: 503 });
  }
}
