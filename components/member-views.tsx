"use client";

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  Apple,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Medal,
  MoonStar,
  MapPin,
  Plus,
  Scale,
  Target,
  TimerReset,
  TrendingDown,
  Trophy,
  UserRoundCheck,
  Utensils,
  X,
} from "lucide-react";
import { trainingExercises, type Booking } from "@/lib/portal-data";
import { usePortal } from "./portal-context";
import { Avatar, Card, ProgressBar, Ring, SectionTitle, StatCard, TrendChart } from "./ui";

const weeklyDays = ["一", "二", "三", "四", "五", "六", "日"];

export function DashboardView({ goTo }: { goTo: (view: string) => void }) {
  const { state, checkIn, notify } = usePortal();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const latest = state.bodyMetrics.at(-1);
  const onboarding = !latest;
  const mealCalories = state.meals
    .filter((meal) => meal.completed)
    .reduce((sum, meal) => sum + meal.calories, 0);
  const scheduledBookings = state.bookings.filter((booking) => !["可预约", "已取消"].includes(booking.status));

  return (
    <div className="view-stack">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">会员工作台</span>
          <h1>早上好，{state.profile.name}</h1>
          <p>{onboarding ? "账号已创建。先完成身体数据记录，邵教练会据此为你建立专属计划。" : "今天安排了一次下肢力量训练，记得提前补充水分。"}</p>
        </div>
        <button className="button button-primary compact-on-mobile" onClick={checkIn}>
          <CalendarCheck size={18} /> 今日打卡
        </button>
      </section>

      <div className="stats-grid four">
        <StatCard icon={Dumbbell} label="本周训练次数" value={onboarding ? "0" : "4"} suffix={onboarding ? "次" : "/ 5 次"} note={onboarding ? "等待教练制定计划" : "点击查看训练计划"} onClick={() => goTo("training")} />
        <StatCard icon={Flame} label="本周消耗（预估）" value={onboarding ? "0" : "6,240"} suffix="kcal" note={onboarding ? "训练后自动累计" : "点击查看饮食执行"} accent="amber" onClick={() => goTo("nutrition")} />
        <StatCard icon={Target} label="连续打卡" value={state.streak} suffix="天" note="点击查看打卡记录" onClick={() => goTo("checkins")} />
        <StatCard icon={HeartPulse} label="综合评分" value={onboarding ? "—" : "92"} suffix={onboarding ? "" : "分"} note={onboarding ? "完成建档后生成" : "点击查看身体趋势"} accent="slate" onClick={() => goTo("body")} />
      </div>

      <div className="dashboard-main-grid">
        <Card className="schedule-card span-2">
          <SectionTitle title="本周私教安排" action={<span className="pill">由教练统一排期</span>} />
          <div className="member-week-schedule">
            {scheduledBookings.map((booking) => (
              <button
                type="button"
                key={booking.id}
                className={`member-session-card ${booking.status === "已预约" ? "is-current" : ""}`}
                onClick={() => setSelectedBooking(booking)}
              >
                <span className="member-session-date"><small>{booking.day}</small><b>{booking.date}</b></span>
                <span className="member-session-copy"><strong>{booking.title || "一对一私教"}</strong><small><Clock3 size={14} /> {booking.time} · {booking.focus || "专属训练课程"}</small></span>
                <em className={`status status-${booking.status}`}>{booking.status}</em>
                <ChevronRight size={18} />
              </button>
            ))}
            {!scheduledBookings.length ? <div className="empty-hint">邵教练暂未发布新的课程排期。</div> : null}
          </div>
          {scheduledBookings.length ? <p className="schedule-helper">点击课程可查看时间、训练内容与调整方式。</p> : null}
        </Card>

        <Card className="weekly-goals-card">
          <SectionTitle title="本周训练目标" action={<span className="weekly-goal-score">{onboarding ? "待开始" : "整体完成 89%"}</span>} />
          <div className="goal-focus">
            <span><Target size={20} /></span>
            <div><small>本周核心目标</small><b>{onboarding ? "完成首次身体记录" : "稳定完成 5 次训练，保持恢复节奏"}</b></div>
          </div>
          <div className="goal-tiles">
            <GoalRow icon={Dumbbell} label="力量训练" value={onboarding ? "待制定" : "4 / 5 次"} percent={onboarding ? 0 : 80} />
            <GoalRow icon={Flame} label="训练消耗" value={onboarding ? "0 kcal" : "6,240 kcal"} percent={onboarding ? 0 : 96} />
            <GoalRow icon={CalendarCheck} label="训练打卡" value={onboarding ? "0 天" : "4 / 5 天"} percent={onboarding ? 0 : 80} />
            <GoalRow icon={Apple} label="饮食执行" value={onboarding ? "尚未记录" : "今日达标"} percent={onboarding ? 0 : 100} />
          </div>
        </Card>

        <Card className="body-trend-card span-2">
          <SectionTitle
            title="身体数据趋势"
            action={<button className="segmented-active" onClick={() => goTo("body")}>体重</button>}
          />
          <div className="chart-shell">
            <TrendChart data={state.bodyMetrics} dataKey="weight" height={205} valueSuffix=" kg" />
          </div>
          <div className="trend-note">{onboarding ? <><Scale size={17} /> 完成首次身体数据记录后，这里会生成你的专属趋势。</> : <><TrendingDown size={17} /> 近三周体重下降 <strong>2.9 kg</strong>，节奏稳定。</>}</div>
        </Card>

        <Card className="coach-advice-card">
          <div className="coach-advice-head"><Avatar name="邵教练" size="lg" /><div><span className="eyebrow">邵教练 · 今日建议</span><h3>{onboarding ? "先完成你的身体建档" : "恢复良好，保持现在的节奏"}</h3></div><BadgeCheck size={20} /></div>
          <blockquote>{onboarding ? "欢迎加入。先记录身体数据和训练目标，我会据此为你制定第一阶段计划。" : "本周力量训练完成度很高。训练后优先补充优质蛋白，今晚保证 7–8 小时睡眠。"}</blockquote>
          <div className="advice-tags"><span><MoonStar size={15} /> 睡眠 7–8 小时</span><span><Apple size={15} /> 补充优质蛋白</span></div>
          <button className="coach-advice-link" onClick={() => goTo("body")}><span><Activity size={17} /> 查看完整身体反馈</span><ArrowRight size={17} /></button>
        </Card>
      </div>

      <div className="lower-grid">
        <Card>
          <SectionTitle title="饮食执行概览" action={<button className="text-button" onClick={() => goTo("nutrition")}>查看详情 <ArrowRight size={15} /></button>} />
          <div className="split-center">
            <Ring value={(mealCalories / 1800) * 100} label={`${mealCalories}`} sublabel="/ 1800 kcal" />
            <div className="macro-list">
              <Macro label="蛋白质" value={onboarding ? "尚未记录" : "124 / 120g"} percent={onboarding ? 0 : 100} />
              <Macro label="碳水" value={onboarding ? "尚未记录" : "173 / 180g"} percent={onboarding ? 0 : 96} />
              <Macro label="脂肪" value={onboarding ? "尚未记录" : "51 / 60g"} percent={onboarding ? 0 : 85} />
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title="打卡记录" action={<button className="text-button" onClick={() => goTo("checkins")}>查看全部 <ArrowRight size={15} /></button>} />
          <div className="streak-panel">
            <Ring value={state.streak ? 72 : 0} label={`${state.streak} 天`} sublabel={state.streak ? "连续保持中" : "从今天开始"} />
            <div className="week-dots">
              {weeklyDays.map((day, index) => (
                <span key={day} className={index < Math.min(6, state.streak) ? "done" : ""}><Check size={14} /><small>{day}</small></span>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle title="当前身体状态" />
          <div className="metric-rows">
            <MetricRow label="体重" value={latest ? `${latest.weight} kg` : "待记录"} delta={latest ? "查看趋势" : "完成首次建档"} />
            <MetricRow label="体脂率" value={latest ? `${latest.bodyFat}%` : "待记录"} delta={latest ? "查看趋势" : "完成首次建档"} />
            <MetricRow label="肌肉量" value={latest ? `${latest.muscle} kg` : "待记录"} delta={latest ? "查看趋势" : "完成首次建档"} />
            <MetricRow label="恢复评分" value={latest ? "82 分" : "待评估"} delta={latest ? "良好" : "等待教练评估"} />
          </div>
        </Card>
      </div>

      {selectedBooking ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedBooking(null)}>
          <section className="modal session-detail-modal" role="dialog" aria-modal="true" aria-label="私教课程详情" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setSelectedBooking(null)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">已发布课程</span>
            <h2>{selectedBooking.title || "一对一私教"}</h2>
            <p>课程由邵教练统一安排，会员端仅展示已确认信息。</p>
            <div className="session-detail-date"><CalendarCheck size={22} /><span><b>{selectedBooking.day} · {selectedBooking.date}</b><small>{selectedBooking.time}</small></span><em className={`status status-${selectedBooking.status}`}>{selectedBooking.status}</em></div>
            <div className="session-detail-grid">
              <span><Dumbbell size={18} /><small>训练重点</small><b>{selectedBooking.focus || "根据当日状态进行专属训练"}</b></span>
              <span><UserRoundCheck size={18} /><small>授课教练</small><b>{selectedBooking.coach || "邵教练"}</b></span>
              <span><MapPin size={18} /><small>上课地点</small><b>邵教练私教工作室</b></span>
              <span><Clock3 size={18} /><small>到场提示</small><b>请提前 10 分钟到场</b></span>
            </div>
            <div className="session-detail-actions">
              <button className="button button-secondary" type="button" onClick={() => setSelectedBooking(null)}>关闭</button>
              <button className="button button-primary" type="button" onClick={() => { setSelectedBooking(null); notify("如需调整课程，请通过微信联系邵教练确认", "info"); }}>联系教练调整</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function GoalRow({ icon: Icon, label, value, percent }: { icon: typeof Dumbbell; label: string; value: string; percent: number }) {
  return (
    <div className="goal-row">
      <span className="goal-icon"><Icon size={18} /></span>
      <div><small>{label}</small><b>{value}</b><ProgressBar value={percent} /></div>
      <em>{percent}%</em>
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
          <Card className="training-rhythm-card">
            <SectionTitle title="训练节奏" action={<span className="pill">75 分钟</span>} />
            <div className="rhythm-progress"><span style={{ width: "32%" }} /></div>
            <div className="rhythm-stage-head"><small>当前阶段</small><b>力量训练 · 已进行 18 分钟</b></div>
            <div className="rhythm-stages">
              <Timeline time="10′" title="热身激活" detail="已完成" done />
              <Timeline time="40′" title="力量训练" detail="进行中" active />
              <Timeline time="15′" title="核心训练" detail="待开始" />
              <Timeline time="10′" title="拉伸放松" detail="待开始" />
            </div>
          </Card>
          <Card className="coach-tip-card">
            <div className="coach-tip-head"><span><UserRoundCheck size={19} /></span><div><small>邵教练提示</small><h3>动作质量优先于重量</h3></div></div>
            <p>深蹲下放时保持膝盖与脚尖方向一致；任何肩部不适都应立即降低负荷。</p>
            <div className="coach-tip-rules"><span><Check size={14} /> 膝盖朝向脚尖</span><span><HeartPulse size={14} /> 不适立即降重</span></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Timeline({ time, title, detail, done, active }: { time: string; title: string; detail: string; done?: boolean; active?: boolean }) {
  return <div className={`rhythm-stage ${done ? "done" : ""} ${active ? "active" : ""}`}><span>{done ? <Check size={14} /> : active ? <TimerReset size={14} /> : <CircleDot size={14} />}</span><div><b>{title}</b><small>{time} · {detail}</small></div></div>;
}

export function NutritionView() {
  const { state, addWater, toggleMeal, notify } = usePortal();
  const [calorieGoal, setCalorieGoal] = useState(1800);
  const goalRef = useRef<HTMLElement | null>(null);
  const calories = state.meals.filter((meal) => meal.completed).reduce((sum, meal) => sum + meal.calories, 0);

  function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextGoal = Math.min(5000, Math.max(1000, Number(data.get("calorieGoal")) || 1800));
    setCalorieGoal(nextGoal);
    notify(`营养目标已更新为 ${nextGoal} 千卡`);
  }

  function revealGoalEditor() {
    goalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => goalRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 450);
  }

  return (
    <div className="view-stack">
      <PageIntro eyebrow="饮食管理" title="吃得科学，也吃得从容" text="每一餐都为今天的训练和明天的恢复服务。" />
      <div className="nutrition-hero-grid">
        <Card className="span-2">
          <SectionTitle title="今日营养进度" action={<button className="button button-secondary button-small" onClick={revealGoalEditor}>调整目标</button>} />
          <div className="nutrition-progress">
            <Ring value={(calories / calorieGoal) * 100} label={`${calories}`} sublabel={`/ ${calorieGoal} kcal`} />
            <div className="macro-list large">
              <Macro label="碳水化合物" value="173 / 180 g" percent={96} />
              <Macro label="蛋白质" value="124 / 120 g" percent={100} />
              <Macro label="脂肪" value="51 / 60 g" percent={85} />
            </div>
          </div>
          <div className="positive-banner"><BadgeCheck size={18} /> 营养目标接近日目标，保持当前节奏</div>
        </Card>
        <Card className="hydration-card">
          <SectionTitle title="今日饮水" action={<span className="hydration-status">{state.waterMl >= 2500 ? "已达标" : "还差 " + Math.max(0, 2500 - state.waterMl) + " ml"}</span>} />
          <div className="hydration-main">
            <div className="hydration-ring" style={{ "--water-progress": `${Math.min(100, (state.waterMl / 2500) * 100)}%` } as CSSProperties}><Droplets size={25} /><strong>{(state.waterMl / 1000).toFixed(1)}</strong><small>/ 2.5 L</small></div>
            <div><b>保持少量多次</b><p>训练前后分次补水，避免一次大量饮用。</p><div className="hydration-dots">{Array.from({ length: 5 }).map((_, index) => <span className={state.waterMl >= (index + 1) * 500 ? "filled" : ""} key={index} />)}</div></div>
          </div>
          <div className="hydration-actions"><button onClick={() => addWater(250)}><Plus size={16} /> 250 ml</button><button onClick={() => addWater(500)}><Plus size={16} /> 500 ml</button></div>
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
      <section className="card inline-editor nutrition-goal-editor" ref={goalRef} id="nutrition-goal">
        <div>
          <span className="eyebrow">营养目标</span>
          <h2>调整每日摄入目标</h2>
          <p>用于计算当天进度。邵教练会结合训练量、恢复和身体变化复核正式方案。</p>
        </div>
        <form onSubmit={saveGoal}>
          <label>每日热量（千卡）<input name="calorieGoal" type="number" min="1000" max="5000" step="50" defaultValue={calorieGoal} required /></label>
          <button className="button button-primary" type="submit">保存目标</button>
        </form>
      </section>
    </div>
  );
}

function Swap({ from, to, note }: { from: string; to: string; note: string }) {
  return <div><span>{from}</span><ArrowRight size={16} /><b>{to}</b><small>{note}</small></div>;
}

export function CheckinsView() {
  const { state, checkIn, notify } = usePortal();
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
              return <button key={day} className={`${done ? "done" : ""} ${today ? "today" : ""}`} onClick={today ? checkIn : () => notify(`7 月 ${day} 日${done ? "已完成打卡" : "没有打卡记录"}`, "info")}><span>{day}</span>{done ? <Check size={13} /> : today ? <CircleDot size={13} /> : null}</button>;
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
  const [metric, setMetric] = useState<"weight" | "bodyFat" | "muscle">("weight");
  const recordRef = useRef<HTMLElement | null>(null);
  const latest = state.bodyMetrics.at(-1);
  const previous = state.bodyMetrics.at(-2);
  const metricLabels = { weight: "体重", bodyFat: "体脂率", muscle: "肌肉量" };
  const metricSuffix = { weight: " kg", bodyFat: "%", muscle: " kg" };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    saveBodyMetric({
      weight: Number(data.get("weight")),
      bodyFat: Number(data.get("bodyFat")),
      muscle: Number(data.get("muscle")),
      waist: Number(data.get("waist")),
    });
    event.currentTarget.reset();
    recordRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function revealRecordForm() {
    recordRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => recordRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 450);
  }

  return (
    <div className="view-stack">
      <div className="page-intro-row">
        <PageIntro eyebrow="身体数据" title="用趋势看进步，不被单日数字左右" text="建议每周固定时间、相同状态测量一次。" />
        <button className="button button-primary" onClick={revealRecordForm}><Plus size={18} /> 记录身体数据</button>
      </div>
      <div className="stats-grid four">
        <StatCard icon={Scale} label="当前体重" value={latest?.weight ?? "—"} suffix={latest ? "kg" : ""} note={latest && previous ? `较上次 ${(latest.weight - previous.weight).toFixed(1)} kg` : "等待首次记录"} />
        <StatCard icon={Target} label="体脂率" value={latest?.bodyFat ?? "—"} suffix={latest ? "%" : ""} note={latest ? "持续记录更准确" : "等待首次记录"} accent="amber" />
        <StatCard icon={Dumbbell} label="肌肉量" value={latest?.muscle ?? "—"} suffix={latest ? "kg" : ""} note={latest ? "持续记录更准确" : "等待首次记录"} />
        <StatCard icon={Footprints} label="腰围" value={latest?.waist ?? "—"} suffix={latest ? "cm" : ""} note={latest ? "持续记录更准确" : "等待首次记录"} accent="slate" />
      </div>
      <Card>
        <SectionTitle title={`近 30 天${metricLabels[metric]}趋势`} action={<div className="segmented"><button className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>体重</button><button className={metric === "bodyFat" ? "active" : ""} onClick={() => setMetric("bodyFat")}>体脂率</button><button className={metric === "muscle" ? "active" : ""} onClick={() => setMetric("muscle")}>肌肉量</button></div>} />
        <div className="large-chart">
          <TrendChart data={state.bodyMetrics} dataKey={metric} height={320} valueSuffix={metricSuffix[metric]} />
        </div>
      </Card>
      <div className="content-grid-3">
        <Card><SectionTitle title="目标进度" /><div className="goal-big"><strong>{latest ? "72%" : "0%"}</strong><span>{latest ? "距离 65 kg 还差 2.9 kg" : "记录首次数据后设置目标"}</span><ProgressBar value={latest ? 72 : 0} /></div></Card>
        <Card><SectionTitle title="本月变化" /><div className="delta-grid"><div><b>{latest ? "-1.9" : "—"}</b><span>kg 体重</span></div><div><b>{latest ? "-0.7" : "—"}</b><span>% 体脂</span></div><div><b>{latest ? "+0.8" : "—"}</b><span>kg 肌肉</span></div></div></Card>
        <Card className="measurement-guide-card">
          <SectionTitle title="科学测量指南" action={<span className="measurement-frequency">每周 1 次</span>} />
          <div className="measurement-steps"><span><Clock3 size={18} /><b>固定时间</b><small>起床排空后、早餐前</small></span><span><Scale size={18} /><b>保持一致</b><small>相同设备与穿着状态</small></span><span><TrendingDown size={18} /><b>关注趋势</b><small>以 2–4 周变化为准</small></span></div>
        </Card>
      </div>
      <section className="card inline-editor body-record-editor" ref={recordRef} id="body-record">
        <div>
          <span className="eyebrow">数据记录</span>
          <h2>记录今天的身体状态</h2>
          <p>统一在起床排空后测量，保留一位小数，便于形成可信趋势。</p>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>体重（kg）<input name="weight" type="number" step="0.1" min="20" max="350" defaultValue={latest?.weight} required /></label>
            <label>体脂率（%）<input name="bodyFat" type="number" step="0.1" min="1" max="70" defaultValue={latest?.bodyFat} required /></label>
            <label>肌肉量（kg）<input name="muscle" type="number" step="0.1" min="5" max="150" defaultValue={latest?.muscle} required /></label>
            <label>腰围（cm）<input name="waist" type="number" step="0.1" min="30" max="250" defaultValue={latest?.waist} required /></label>
          </div>
          <button className="button button-primary" type="submit">保存本次记录</button>
        </form>
      </section>
    </div>
  );
}

export function BenefitsView() {
  const { notify } = usePortal();
  const benefits = [
    { icon: UserRoundCheck, title: "一对一专属指导", text: "邵教练根据你的训练反馈与身体变化实时调整方案。" },
    { icon: CalendarCheck, title: "优先排期权益", text: "一对一私教时段由邵教练优先安排，重要周期提前锁定。" },
    { icon: Activity, title: "完整身体评估", text: "周期性体态、体成分与运动表现评估，趋势持续可追踪。" },
    { icon: HeartPulse, title: "教练周期复盘", text: "训练、饮食与恢复由邵教练统一复盘并给出下一阶段安排。" },
    { icon: Apple, title: "个性化饮食方案", text: "按目标、口味与鄂州本地饮食习惯制定可执行方案。" },
    { icon: BadgeCheck, title: "隐私与数据保护", text: "数据最小化采集、分角色访问，并提供导出和注销流程。" },
  ];
  return (
    <div className="view-stack">
      <Card className="membership-hero">
        <div><span className="eyebrow light">尊享会员 · 年度计划</span><h1>每一次进步，都有专属团队陪你完成</h1><p>有效期至 2027/07/10 · 剩余 346 天</p><button className="button button-light" onClick={() => { window.location.href = "/terms"; }}>查看会员协议 <ArrowRight size={17} /></button></div>
        <div className="membership-mark"><Medal size={54} /><strong>VIP</strong><span>NO. 20260711028</span></div>
      </Card>
      <div className="benefit-grid">
        {benefits.map(({ icon: Icon, title, text }) => <Card key={title} className="benefit-card"><span><Icon size={26} /></span><h3>{title}</h3><p>{text}</p><button className="text-button" onClick={() => notify(`${title}：${text}`, "info")}>了解详情 <ArrowRight size={15} /></button></Card>)}
      </div>
      <Card>
        <SectionTitle title="会员服务承诺" />
        <div className="promise-grid"><div><b>24 小时</b><span>工作日消息响应</span></div><div><b>每 4 周</b><span>计划复盘与更新</span></div><div><b>100%</b><span>训练记录可导出</span></div><div><b>一对一</b><span>专属私教服务</span></div></div>
      </Card>
    </div>
  );
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></section>;
}
