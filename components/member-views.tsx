"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Apple,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  CircleDot,
  Clock3,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Medal,
  MoonStar,
  Plus,
  Scale,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  Trophy,
  UserRoundCheck,
  Utensils,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trainingExercises } from "@/lib/portal-data";
import { usePortal } from "./portal-context";
import { Avatar, Card, ProgressBar, Ring, SectionTitle, StatCard } from "./ui";

const weeklyDays = ["一", "二", "三", "四", "五", "六", "日"];

export function DashboardView({ goTo }: { goTo: (view: string) => void }) {
  const { state, checkIn } = usePortal();
  const latest = state.bodyMetrics.at(-1)!;
  const mealCalories = state.meals
    .filter((meal) => meal.completed)
    .reduce((sum, meal) => sum + meal.calories, 0);

  return (
    <div className="view-stack">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">会员工作台</span>
          <h1>早上好，{state.profile.name}</h1>
          <p>今天安排了一次下肢力量训练，记得提前补充水分。</p>
        </div>
        <button className="button button-primary compact-on-mobile" onClick={checkIn}>
          <CalendarCheck size={18} /> 今日打卡
        </button>
      </section>

      <div className="stats-grid four">
        <StatCard icon={Dumbbell} label="本周训练次数" value="4" suffix="/ 5 次" note="完成 80%" />
        <StatCard icon={Flame} label="本周消耗（预估）" value="6,240" suffix="kcal" note="较上周 ↑12%" accent="amber" />
        <StatCard icon={Target} label="连续打卡" value={state.streak} suffix="天" note="连续保持中" />
        <StatCard icon={HeartPulse} label="综合评分" value="92" suffix="分" note="优秀" accent="slate" />
      </div>

      <div className="dashboard-main-grid">
        <Card className="schedule-card span-2">
          <SectionTitle title="本周安排" action={<button className="text-button" onClick={() => goTo("booking")}>查看课表 <ArrowRight size={15} /></button>} />
          <div className="mini-week">
            {state.bookings.map((booking, index) => (
              <button
                key={booking.id}
                className={`mini-day ${booking.status === "已预约" ? "is-current" : ""}`}
                onClick={() => goTo("booking")}
              >
                <span>{booking.day}</span>
                <b>{booking.date}</b>
                <strong>{booking.title}</strong>
                <small>{booking.time}</small>
                <em className={`status status-${booking.status}`}>{booking.status}</em>
                {index === 2 ? <span className="today-dot" /> : null}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="本周训练目标" />
          <div className="goal-list">
            <GoalRow icon={Dumbbell} label="完成 4 次力量训练" value="4 / 5 次" percent={80} />
            <GoalRow icon={Flame} label="累计消耗 6500 kcal" value="6,240 / 6,500" percent={96} />
            <GoalRow icon={CalendarCheck} label="打卡 5 天" value="4 / 5 天" percent={80} />
            <GoalRow icon={Apple} label="蛋白质摄入达标" value="今日已达标" percent={100} />
          </div>
        </Card>

        <Card className="body-trend-card span-2">
          <SectionTitle
            title="身体数据趋势"
            action={<button className="segmented-active" onClick={() => goTo("body")}>体重</button>}
          />
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={205}>
              <LineChart data={state.bodyMetrics} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#e8e6dd" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#807f75", fontSize: 12 }} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} axisLine={false} tickLine={false} tick={{ fill: "#807f75", fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dedaCE", background: "#fffdf8" }} />
                <Line type="monotone" dataKey="weight" stroke="#3f4d31" strokeWidth={2.5} dot={{ r: 4, fill: "#fffdf8", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="trend-note"><TrendingDown size={17} /> 近三周体重下降 <strong>2.9 kg</strong>，节奏稳定。</div>
        </Card>

        <Card>
          <SectionTitle title="邵教练建议" />
          <div className="coach-note">
            <Avatar name="邵教练" size="lg" />
            <div>
              <p>本周力量训练完成度很高，恢复状态良好。训练后优先补充优质蛋白，今晚保证 7–8 小时睡眠。</p>
              <span>— 邵教练 · 今天 09:30</span>
            </div>
          </div>
          <button className="button button-secondary full" onClick={() => goTo("assistant")}>
            <Sparkles size={17} /> 问问 Hermes 智能助理
          </button>
        </Card>
      </div>

      <div className="lower-grid">
        <Card>
          <SectionTitle title="饮食执行概览" action={<button className="text-button" onClick={() => goTo("nutrition")}>查看详情 <ArrowRight size={15} /></button>} />
          <div className="split-center">
            <Ring value={(mealCalories / 1800) * 100} label={`${mealCalories}`} sublabel="/ 1800 kcal" />
            <div className="macro-list">
              <Macro label="蛋白质" value="124 / 120g" percent={100} />
              <Macro label="碳水" value="173 / 180g" percent={96} />
              <Macro label="脂肪" value="51 / 60g" percent={85} />
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title="打卡记录" action={<button className="text-button" onClick={() => goTo("checkins")}>查看全部 <ArrowRight size={15} /></button>} />
          <div className="streak-panel">
            <Ring value={72} label={`${state.streak} 天`} sublabel="连续保持中" />
            <div className="week-dots">
              {weeklyDays.map((day, index) => (
                <span key={day} className={index < 6 ? "done" : ""}><Check size={14} /><small>{day}</small></span>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title="当前身体状态" />
          <div className="metric-rows">
            <MetricRow label="体重" value={`${latest.weight} kg`} delta="↓ 2.9 kg" />
            <MetricRow label="体脂率" value={`${latest.bodyFat}%`} delta="↓ 1.9%" />
            <MetricRow label="肌肉量" value={`${latest.muscle} kg`} delta="↑ 1.6 kg" />
            <MetricRow label="恢复评分" value="82 分" delta="良好" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function GoalRow({ icon: Icon, label, value, percent }: { icon: typeof Dumbbell; label: string; value: string; percent: number }) {
  return (
    <div className="goal-row">
      <span className="goal-icon"><Icon size={18} /></span>
      <div><div className="row-between"><b>{label}</b><small>{value}</small></div><ProgressBar value={percent} /></div>
    </div>
  );
}

function Macro({ label, value, percent }: { label: string; value: string; percent: number }) {
  return <div><div className="row-between"><span>{label}</span><b>{value}</b></div><ProgressBar value={percent} /></div>;
}

function MetricRow({ label, value, delta }: { label: string; value: string; delta: string }) {
  return <div><span>{label}</span><b>{value}</b><em>{delta}</em></div>;
}

export function TrainingView() {
  const { notify } = usePortal();
  const [completed, setCompleted] = useState<number[]>([0]);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="view-stack">
      <PageIntro eyebrow="训练计划" title="今天，稳稳完成每一组" text="下肢力量 · 75 分钟 · 预计消耗 520 kcal" />
      <div className="stats-grid four">
        <StatCard icon={Clock3} label="计划时长" value="75" suffix="分钟" note="含热身与拉伸" />
        <StatCard icon={Dumbbell} label="训练动作" value="8" suffix="组" note="4 个主要动作" />
        <StatCard icon={Flame} label="预计消耗" value="520" suffix="kcal" note="根据近期心率估算" accent="amber" />
        <StatCard icon={HeartPulse} label="今日状态" value="82" suffix="分" note="适合正常训练" accent="slate" />
      </div>
      <div className="training-layout">
        <Card className="span-2">
          <SectionTitle title="今日训练" eyebrow="08:00 开始" action={<span className="pill">第 3 周 · 计划 A</span>} />
          <div className="exercise-list">
            {trainingExercises.map((exercise, index) => {
              const done = completed.includes(index);
              return (
                <button
                  className={`exercise-row ${done ? "is-done" : ""}`}
                  key={exercise.name}
                  onClick={() => setCompleted((items) => done ? items.filter((item) => item !== index) : [...items, index])}
                >
                  <span className="exercise-check">{done ? <Check size={18} /> : index + 1}</span>
                  <span><b>{exercise.name}</b><small>{exercise.focus}</small></span>
                  <span><b>{exercise.detail}</b><small>{exercise.load}</small></span>
                  <ArrowRight size={18} />
                </button>
              );
            })}
          </div>
          <div className="workout-controls">
            <div className="timer-readout"><TimerReset size={22} /><strong>{formatted}</strong><span>{running ? "训练计时中" : "准备开始"}</span></div>
            <button className="button button-primary" onClick={() => setRunning((value) => !value)}>{running ? "暂停训练" : seconds ? "继续训练" : "开始训练"}</button>
            <button className="button button-secondary" onClick={() => { setRunning(false); notify("本次训练已完成，辛苦了！"); }}>完成训练</button>
          </div>
        </Card>
        <div className="side-stack">
          <Card>
            <SectionTitle title="训练节奏" />
            <div className="timeline-list">
              <Timeline time="08:00" title="热身激活" detail="10 分钟" done />
              <Timeline time="08:10" title="力量训练" detail="40 分钟" active />
              <Timeline time="08:50" title="核心训练" detail="15 分钟" />
              <Timeline time="09:05" title="拉伸放松" detail="10 分钟" />
            </div>
          </Card>
          <Card className="coach-tip-card">
            <Avatar name="邵教练" size="lg" />
            <div><span className="eyebrow">教练提示</span><h3>动作质量优先</h3></div>
            <p>深蹲下放时保持膝盖与脚尖方向一致；如果肩部不适，卧推重量立即下调。</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Timeline({ time, title, detail, done, active }: { time: string; title: string; detail: string; done?: boolean; active?: boolean }) {
  return <div className={`timeline-item ${done ? "done" : ""} ${active ? "active" : ""}`}><span>{done ? <Check size={14} /> : <CircleDot size={14} />}</span><time>{time}</time><div><b>{title}</b><small>{detail}</small></div></div>;
}

export function NutritionView() {
  const { state, addWater, toggleMeal } = usePortal();
  const calories = state.meals.filter((meal) => meal.completed).reduce((sum, meal) => sum + meal.calories, 0);
  return (
    <div className="view-stack">
      <PageIntro eyebrow="饮食管理" title="吃得科学，也吃得从容" text="每一餐都为今天的训练和明天的恢复服务。" />
      <div className="nutrition-hero-grid">
        <Card className="span-2">
          <SectionTitle title="今日营养进度" action={<button className="button button-secondary button-small">调整目标</button>} />
          <div className="nutrition-progress">
            <Ring value={(calories / 1800) * 100} label={`${calories}`} sublabel="/ 1800 kcal" />
            <div className="macro-list large">
              <Macro label="碳水化合物" value="173 / 180 g" percent={96} />
              <Macro label="蛋白质" value="124 / 120 g" percent={100} />
              <Macro label="脂肪" value="51 / 60 g" percent={85} />
            </div>
          </div>
          <div className="positive-banner"><BadgeCheck size={18} /> 营养目标接近日目标，保持当前节奏</div>
        </Card>
        <Card>
          <SectionTitle title="饮水记录" />
          <strong className="water-value">{(state.waterMl / 1000).toFixed(1)} <small>/ 2.5 L</small></strong>
          <div className="cups" aria-label="今日饮水进度">
            {Array.from({ length: 7 }).map((_, index) => <span className={state.waterMl >= (index + 1) * 350 ? "filled" : ""} key={index}><Droplets size={18} /></span>)}
          </div>
          <ProgressBar value={(state.waterMl / 2500) * 100} />
          <button className="button button-primary full" onClick={() => addWater(250)}><Plus size={17} /> 记录一杯 250 ml</button>
        </Card>
      </div>
      <div className="content-grid-2">
        <Card>
          <SectionTitle title="今日饮食计划" action={<span className="pill">{state.meals.filter((meal) => meal.completed).length} / 4 已完成</span>} />
          <div className="meal-list">
            {state.meals.map((meal) => (
              <button key={meal.id} className={`meal-row ${meal.completed ? "is-done" : ""}`} onClick={() => toggleMeal(meal.id)}>
                <span className="meal-icon"><Utensils size={18} /></span>
                <span><b>{meal.type}</b><small>{meal.time}</small></span>
                <span className="meal-food">{meal.food}</span>
                <span><b>{meal.calories}</b><small>千卡</small></span>
                <span className="meal-check">{meal.completed ? <Check size={16} /> : <Plus size={16} />}</span>
              </button>
            ))}
          </div>
        </Card>
        <div className="side-stack">
          <Card>
            <SectionTitle title="食材替换建议" />
            <div className="swap-list">
              <Swap from="白米饭 100g" to="糙米饭 100g" note="膳食纤维更高" />
              <Swap from="鸡胸肉 100g" to="鸡腿肉 100g" note="口感更佳" />
              <Swap from="牛奶 250ml" to="无糖豆浆 250ml" note="低乳糖替代" />
              <Swap from="沙拉酱 20g" to="油醋汁 20g" note="减少隐形脂肪" />
            </div>
          </Card>
          <Card className="warning-card"><HeartPulse size={22} /><div><b>今日需要注意</b><p>蛋白质略高于目标，晚餐减少额外蛋白粉；饮水量仍差 700 ml。</p></div></Card>
        </div>
      </div>
    </div>
  );
}

function Swap({ from, to, note }: { from: string; to: string; note: string }) {
  return <div><span>{from}</span><ArrowRight size={16} /><b>{to}</b><small>{note}</small></div>;
}

export function CheckinsView() {
  const { state, checkIn } = usePortal();
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  return (
    <div className="view-stack">
      <PageIntro eyebrow="打卡记录" title={`${state.streak} 天，习惯正在生长`} text="记录训练、饮食、睡眠与心情，让教练看到真实的恢复状态。" />
      <div className="stats-grid four">
        <StatCard icon={CalendarCheck} label="连续打卡" value={state.streak} suffix="天" note="距离纪录还差 27 天" />
        <StatCard icon={Trophy} label="历史最长" value="45" suffix="天" note="继续挑战个人纪录" accent="amber" />
        <StatCard icon={Activity} label="本月完成" value="18" suffix="/ 22 天" note="完成率 82%" />
        <StatCard icon={MoonStar} label="平均睡眠" value="7.4" suffix="小时" note="较上月 +0.6 小时" accent="slate" />
      </div>
      <div className="content-grid-2">
        <Card>
          <SectionTitle title="2026 年 7 月" action={<button className="button button-primary button-small" onClick={checkIn}><CalendarCheck size={16} /> 今日打卡</button>} />
          <div className="calendar-head">{weeklyDays.map((day) => <span key={day}>周{day}</span>)}</div>
          <div className="calendar-grid">
            {days.map((day) => {
              const done = day >= 7 && day <= 28;
              const today = day === 29;
              return <button key={day} className={`${done ? "done" : ""} ${today ? "today" : ""}`} onClick={today ? checkIn : undefined}><span>{day}</span>{done ? <Check size={13} /> : today ? <CircleDot size={13} /> : null}</button>;
            })}
          </div>
          <div className="calendar-legend"><span><i className="legend-done" /> 已完成</span><span><i className="legend-today" /> 今天</span><span><i /> 未打卡</span></div>
        </Card>
        <div className="side-stack">
          <Card>
            <SectionTitle title="今日打卡清单" />
            <div className="checklist">
              {["完成计划训练", "蛋白质摄入达标", "饮水达到 2.5 L", "睡眠不少于 7 小时"].map((item, index) => <label key={item}><input type="checkbox" defaultChecked={index < 2} /><span><Check size={15} /></span>{item}</label>)}
            </div>
          </Card>
          <Card className="quote-card"><Medal size={28} /><blockquote>“进步不是偶然，是一次次按计划完成的普通日子。”</blockquote><span>— 邵教练</span></Card>
        </div>
      </div>
    </div>
  );
}

export function BodyView() {
  const { state, saveBodyMetric } = usePortal();
  const [open, setOpen] = useState(false);
  const latest = state.bodyMetrics.at(-1)!;
  const previous = state.bodyMetrics.at(-2)!;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    saveBodyMetric({
      weight: Number(data.get("weight")),
      bodyFat: Number(data.get("bodyFat")),
      muscle: Number(data.get("muscle")),
      waist: Number(data.get("waist")),
    });
    setOpen(false);
  }

  return (
    <div className="view-stack">
      <div className="page-intro-row">
        <PageIntro eyebrow="身体数据" title="用趋势看进步，不被单日数字左右" text="建议每周固定时间、相同状态测量一次。" />
        <button className="button button-primary" onClick={() => setOpen(true)}><Plus size={18} /> 记录身体数据</button>
      </div>
      <div className="stats-grid four">
        <StatCard icon={Scale} label="当前体重" value={latest.weight} suffix="kg" note={`较上次 ${(latest.weight - previous.weight).toFixed(1)} kg`} />
        <StatCard icon={Target} label="体脂率" value={latest.bodyFat} suffix="%" note="目标 13.5%" accent="amber" />
        <StatCard icon={Dumbbell} label="肌肉量" value={latest.muscle} suffix="kg" note="近三周 +1.6 kg" />
        <StatCard icon={Footprints} label="腰围" value={latest.waist} suffix="cm" note="近三周 -3.1 cm" accent="slate" />
      </div>
      <Card>
        <SectionTitle title="近 30 天身体趋势" action={<div className="segmented"><button className="active">体重</button><button>体脂率</button><button>肌肉量</button></div>} />
        <div className="large-chart">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={state.bodyMetrics} margin={{ top: 15, right: 22, left: -8, bottom: 8 }}>
              <CartesianGrid stroke="#e8e6dd" vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dedaCE" }} />
              <Line type="monotone" dataKey="weight" stroke="#3f4d31" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: "#fffdf8" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="content-grid-3">
        <Card><SectionTitle title="目标进度" /><div className="goal-big"><strong>72%</strong><span>距离 65 kg 还差 2.9 kg</span><ProgressBar value={72} /></div></Card>
        <Card><SectionTitle title="本月变化" /><div className="delta-grid"><div><b>-1.9</b><span>kg 体重</span></div><div><b>-0.7</b><span>% 体脂</span></div><div><b>+0.8</b><span>kg 肌肉</span></div></div></Card>
        <Card><SectionTitle title="测量提示" /><p className="body-copy">起床排空后、早餐前测量；穿着保持一致。短期波动多来自水分，关注 2–4 周趋势。</p></Card>
      </div>
      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">数据记录</span><h2>记录今天的身体状态</h2><p>保留一位小数，测量单位已固定。</p>
            <div className="form-grid">
              <label>体重（kg）<input name="weight" type="number" step="0.1" defaultValue={latest.weight} required /></label>
              <label>体脂率（%）<input name="bodyFat" type="number" step="0.1" defaultValue={latest.bodyFat} required /></label>
              <label>肌肉量（kg）<input name="muscle" type="number" step="0.1" defaultValue={latest.muscle} required /></label>
              <label>腰围（cm）<input name="waist" type="number" step="0.1" defaultValue={latest.waist} required /></label>
            </div>
            <button className="button button-primary full" type="submit">保存记录</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function BookingView() {
  const { state, updateBooking } = usePortal();
  return (
    <div className="view-stack">
      <PageIntro eyebrow="课程预约" title="课程预约与上课课表" text="查看本周安排与教练空闲时段，合理安排训练节奏。" />
      <div className="booking-layout">
        <Card className="span-3">
          <div className="booking-toolbar">
            <div className="segmented"><button className="active">周视图</button><button>月视图</button></div>
            <strong>2026 年 7 月 27 日 — 8 月 2 日</strong>
            <div className="toolbar-actions"><select aria-label="课程类型"><option>全部课程类型</option><option>私教课</option><option>团体课</option></select><button className="button button-primary button-small"><Plus size={16} /> 预约课程</button></div>
          </div>
          <div className="booking-week">
            {state.bookings.map((booking) => (
              <div className="booking-day" key={booking.id}>
                <header><span>{booking.day}</span><b>{booking.date}</b></header>
                <article className={`booking-slot status-${booking.status}`}>
                  <span>{booking.time}</span><h3>{booking.title}</h3><small>{booking.coach}</small><em>{booking.status}</em>
                  {booking.status === "可预约" || booking.status === "已预约" ? <button onClick={() => updateBooking(booking.id)}>{booking.status === "可预约" ? "立即预约" : "取消预约"}</button> : null}
                </article>
              </div>
            ))}
          </div>
          <div className="calendar-legend"><span><i className="legend-done" /> 已完成</span><span><i className="legend-booked" /> 已预约</span><span><i className="legend-open" /> 可预约</span><span><i className="legend-wait" /> 待确认</span></div>
        </Card>
        <div className="side-stack">
          <Card className="coach-availability">
            <div className="coach-hero"><Avatar name="邵教练" size="lg" /><div><span className="eyebrow">本周安排</span><h3>邵教练</h3></div></div>
            <div className="availability"><strong>86%</strong><ProgressBar value={86} /><span>本周可约时段</span></div>
            <button className="button button-secondary full"><CalendarCheck size={17} /> 查看完整时间表</button>
          </Card>
          <Card>
            <SectionTitle title="我的上课统计" />
            <div className="number-grid"><div><span>本周已上课</span><b>4 节</b></div><div><span>本周已预约</span><b>2 节</b></div><div><span>本月累计</span><b>16 节</b></div><div><span>出勤率</span><b>92%</b></div></div>
          </Card>
          <Card>
            <SectionTitle title="预约规则" />
            <ul className="plain-list"><li>私教课至少提前 12 小时预约</li><li>待确认课程将在 2 小时内处理</li><li>取消预约请提前至少 12 小时</li><li>爽约将影响后续优先预约资格</li></ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function BenefitsView() {
  const benefits = [
    { icon: UserRoundCheck, title: "一对一专属指导", text: "邵教练根据你的训练反馈与身体变化实时调整方案。" },
    { icon: CalendarCheck, title: "优先预约特权", text: "私教课与精品小班优先锁定，重要时段提前开放。" },
    { icon: Activity, title: "完整身体评估", text: "周期性体态、体成分与运动表现评估，趋势持续可追踪。" },
    { icon: Sparkles, title: "Hermes 智能助理", text: "全天候训练与饮食答疑，重要建议由教练确认后推送。" },
    { icon: Apple, title: "个性化饮食方案", text: "按目标、口味与武汉本地饮食习惯制定可执行方案。" },
    { icon: BadgeCheck, title: "隐私与数据保护", text: "数据最小化采集、分角色访问，并提供导出和注销流程。" },
  ];
  return (
    <div className="view-stack">
      <Card className="membership-hero">
        <div><span className="eyebrow light">尊享会员 · 年度计划</span><h1>每一次进步，都有专属团队陪你完成</h1><p>有效期至 2027/07/10 · 剩余 346 天</p><button className="button button-light">查看会员协议 <ArrowRight size={17} /></button></div>
        <div className="membership-mark"><Medal size={54} /><strong>VIP</strong><span>NO. 20260711028</span></div>
      </Card>
      <div className="benefit-grid">
        {benefits.map(({ icon: Icon, title, text }) => <Card key={title} className="benefit-card"><span><Icon size={26} /></span><h3>{title}</h3><p>{text}</p><button className="text-button">了解详情 <ArrowRight size={15} /></button></Card>)}
      </div>
      <Card>
        <SectionTitle title="会员服务承诺" />
        <div className="promise-grid"><div><b>24 小时</b><span>工作日消息响应</span></div><div><b>每 4 周</b><span>计划复盘与更新</span></div><div><b>100%</b><span>训练记录可导出</span></div><div><b>7 × 24</b><span>Hermes 智能答疑</span></div></div>
      </Card>
    </div>
  );
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></section>;
}
