"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  FileText,
  HeartPulse,
  MessageCircleMore,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  defaultNutritionPlan,
  defaultTrainingPlan,
  memberRows,
  type BodyMetric,
  type Booking,
  type NutritionPlan,
  type PortalState,
  type TrainingPlan,
} from "@/lib/portal-data";
import { portalFetch } from "@/lib/portal-auth";
import { usePortal } from "./portal-context";
import { Avatar, Card, ProgressBar, SectionTitle, StatCard, TrendChart } from "./ui";

export type CoachSection = "overview" | "members" | "schedule" | "training" | "nutrition" | "body" | "conversations";
type CoachMember = (typeof memberRows)[number];

type CoachWorkspaceProps = {
  section: CoachSection;
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  goTo: (view: string, href?: string, label?: string) => void;
  openAssistant: () => void;
};

export function CoachWorkspace({
  section,
  selectedMemberId,
  onSelectMember,
  goTo,
  openAssistant,
}: CoachWorkspaceProps) {
  const {
    state,
    role,
    addCoachBooking,
    deleteCoachBooking,
    saveTrainingPlan,
    saveNutritionPlan,
    saveBodyFeedback,
    updateMemberProfile,
  } = usePortal();
  const [members, setMembers] = useState<CoachMember[]>([]);
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0];
  const sectionLabels: Record<CoachSection, string> = {
    overview: "工作台",
    members: "会员管理",
    schedule: "课程排期",
    training: "训练方案",
    nutrition: "饮食方案",
    body: "身体反馈",
    conversations: "客服记录",
  };

  useEffect(() => {
    portalFetch("/api/users", role)
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { users?: Array<{ id: string; name: string; phone: string; role: string; status: string }> };
        const actualMembers = result.users?.filter((user) => Boolean(user.id) && user.role === "member" && user.status === "active") ?? [];
        if (!actualMembers.length) return;
        setMembers(actualMembers.map((user) => ({
          id: user.id,
          name: user.name,
          phone: user.phone,
          plan: "由教练在档案中设置",
          goal: "进入档案查看",
          recovery: 0,
          attendance: 0,
          risk: "待评估",
          next: "待安排",
          last: "—",
        })));
      })
      .catch(() => undefined);
  }, [role]);

  return (
    <div className="view-stack coach-workspace">
      {section === "overview" ? (
        <CoachOverview
          openAssistant={openAssistant}
          goTo={goTo}
          onSelectMember={onSelectMember}
          members={members}
        />
      ) : !selectedMember ? (
        <div className="empty-hint">正在加载会员列表，请稍候…</div>
      ) : (
        <>
          <section className="coach-section-heading">
            <div>
              <span className="eyebrow">教练工作台 · {sectionLabels[section]}</span>
              <h1>{sectionLabels[section]}</h1>
              <p>{section === "members" ? "先进入会员档案，再围绕同一位会员安排训练、饮食和身体反馈。" : `当前正在为 ${selectedMember.name} 处理专属服务。`}</p>
            </div>
            <span className="auto-sync-note"><Check size={16} /> 页面与 AI 修改会自动同步</span>
          </section>
          {section !== "members" ? (
            <MemberContextBar member={selectedMember} members={members} onSelectMember={onSelectMember} goTo={goTo} />
          ) : null}
          {section === "members" ? <MemberManagement members={members} selectedMemberId={selectedMember.id} onSelectMember={onSelectMember} goTo={goTo} profile={state.profile} onUpdateProfile={(profile) => updateMemberProfile(profile, selectedMember.id)} /> : null}
          {section === "schedule" ? <CoachSchedule member={selectedMember} bookings={state.bookings} addBooking={(booking) => addCoachBooking(booking, selectedMember.id)} deleteBooking={(id) => deleteCoachBooking(id, selectedMember.id)} /> : null}
          {section === "training" ? <TrainingDesigner key={`${selectedMember.id}-${state.profile.id}-${state.trainingPlan?.updatedAt ?? "default"}`} member={selectedMember} plan={state.trainingPlan ?? defaultTrainingPlan} onSave={(plan) => saveTrainingPlan(plan, selectedMember.id)} /> : null}
          {section === "nutrition" ? <NutritionDesigner key={`${selectedMember.id}-${state.profile.id}-${state.nutritionPlan?.updatedAt ?? "default"}`} member={selectedMember} plan={state.nutritionPlan ?? defaultNutritionPlan} onSave={(plan) => saveNutritionPlan(plan, selectedMember.id)} /> : null}
          {section === "body" ? <BodyFeedback key={`${selectedMember.id}-${state.profile.id}-${state.bodyFeedbacks?.at(-1)?.id ?? "none"}`} member={selectedMember} data={state.bodyMetrics} feedbacks={state.bodyFeedbacks ?? []} onSave={(feedback) => saveBodyFeedback(feedback, selectedMember.id)} /> : null}
          {section === "conversations" ? <CustomerConversationArchive role={role} /> : null}
        </>
      )}
    </div>
  );
}

function CoachOverview({
  openAssistant,
  goTo,
  onSelectMember,
  members,
}: {
  openAssistant: () => void;
  goTo: CoachWorkspaceProps["goTo"];
  onSelectMember: (memberId: string) => void;
  members: CoachMember[];
}) {
  const { state } = usePortal();
  const pending = state.suggestions.filter((item) => item.status === "待确认").length;
  const [recapOpen, setRecapOpen] = useState(false);
  const realMembers = members.filter((member) => Boolean(member.id) && Boolean(member.name));
  const completedMeals = state.meals.filter((meal) => meal.completed);
  const mealCalories = completedMeals.reduce((sum, meal) => sum + meal.calories, 0);
  const calorieTarget = state.nutritionPlan?.calories ?? 0;
  const nutritionPercent = calorieTarget > 0 ? Math.min(100, Math.round((mealCalories / calorieTarget) * 100)) : 0;
  const waterPercent = Math.min(100, Math.round((state.waterMl / 2000) * 100));
  const scheduled = state.bookings.filter((booking) => !["可预约", "已取消"].includes(booking.status));
  const doneBookings = state.bookings.filter((booking) => booking.status === "已完成");
  const bookingPercent = scheduled.length > 0 ? Math.min(100, Math.round((doneBookings.length / scheduled.length) * 100)) : 0;
  const totalSuggestions = state.suggestions.length;
  const sentSuggestions = state.suggestions.filter((item) => item.status === "已发送").length;
  const suggestionPercent = totalSuggestions > 0 ? Math.min(100, Math.round((sentSuggestions / totalSuggestions) * 100)) : 0;
  const latestMetric = state.bodyMetrics.at(-1);
  const weekRange = currentWeekRange();
  return (
    <>
      <section className="coach-hero-row">
        <div>
          <span className="eyebrow">教练运营总览</span>
          <h1>上午好，邵教练</h1>
          <p>先处理今天的私教课，再跟进需要调整方案的会员。</p>
        </div>
        <div className="inline-actions">
          <button className="button button-secondary" onClick={openAssistant}><Sparkles size={17} /> AI 工作台</button>
          <button className="button button-primary" onClick={() => goTo("coach-members", "/coach/members", "会员管理")}><UserRoundPlus size={17} /> 管理会员</button>
        </div>
      </section>
      <div className="stats-grid four coach-kpis">
        <StatCard icon={UsersRound} label="活跃会员" value={realMembers.length} suffix="人" note="来自会员账号列表" onClick={() => goTo("coach-members", "/coach/members", "会员管理")} />
        <StatCard icon={Sparkles} label="AI 待确认" value={pending} suffix="条" note="确认后创建企微任务" accent="slate" onClick={openAssistant} />
        <StatCard icon={CalendarCheck} label="当前会员连续打卡" value={state.streak} suffix="天" note={state.profile.name || "未选择会员"} onClick={() => goTo("coach-body", "/coach/body", "身体反馈")} />
        <StatCard icon={Activity} label="当前会员身体记录" value={state.bodyMetrics.length} suffix="条" note={latestMetric ? `最近 ${latestMetric.date}` : "暂无记录"} accent="amber" onClick={() => goTo("coach-body", "/coach/body", "身体反馈")} />
      </div>
      <div className="coach-overview-grid">
        <Card className="coach-today-card span-2">
          <SectionTitle title="课程排期" action={<span className="pill">按会员查看与调整</span>} />
          {scheduled.length ? (
            <div className="coach-timeline coach-timeline-day">
              {scheduled.slice(0, 5).map((booking, index) => (
                <button key={booking.id} onClick={() => goTo("coach-schedule", "/coach/schedule", "课程排期")}>
                  <time><small>{booking.day}</small>{booking.time}</time>
                  <i className={index === 0 ? "active" : ""} />
                  <Avatar name={state.profile.name || "会员"} size="sm" />
                  <span><b>{state.profile.name || "当前会员"}</b><small>{booking.date} · {booking.focus || "一对一私教"}</small></span>
                  <em>{booking.status}</em>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-hint">总览展示当前会员（{state.profile.name || "未选择"}）的课程排期。选择会员后，可在「课程排期」中安排一对一私教。</div>
          )}
          <button className="schedule-full-link" onClick={() => goTo("coach-schedule", "/coach/schedule", "课程排期")}>进入完整课程排期 <ArrowRight size={15} /></button>
        </Card>
        <Card>
          <SectionTitle title="今日优先事项" />
          <div className="priority-list">
            <button onClick={openAssistant}><Sparkles size={19} /><span><b>{pending} 条 AI 建议待确认</b><small>由教练确认后创建企微任务</small></span><em>待办</em></button>
            <button onClick={() => goTo("coach-body", "/coach/body", "身体反馈")}><Activity size={19} /><span><b>身体反馈</b><small>记录并回复当前会员身体数据</small></span><em>跟进</em></button>
            <button onClick={() => goTo("coach-nutrition", "/coach/nutrition", "饮食方案")}><Apple size={19} /><span><b>饮食方案</b><small>为当前会员调整饮食计划</small></span><em>跟进</em></button>
          </div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="会员快照" action={<button className="text-button" onClick={() => goTo("coach-members", "/coach/members", "会员管理")}>查看全部会员 <ArrowRight size={15} /></button>} />
          <div className="member-snapshot-grid">
            {realMembers.length === 0 ? <div className="empty-hint">暂无活跃会员账号。</div> : realMembers.slice(0, 4).map((member) => (
              <button key={member.id} onClick={() => {
                onSelectMember(member.id);
                goTo("coach-members", "/coach/members", "会员管理");
              }}>
                <div><Avatar name={member.name} /><span><b>{member.name}</b><small>{member.phone}</small></span></div>
                <p>进入档案查看训练、饮食与身体数据</p>
                <div className="snapshot-metrics"><span>账号状态 <b>正常</b></span></div>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="当前会员执行概览" />
          <div className="quality-list">
            <QualityRow label="饮食执行" value={nutritionPercent} />
            <QualityRow label="饮水目标" value={waterPercent} />
            <QualityRow label="课程完成" value={bookingPercent} />
            <QualityRow label="建议处理" value={suggestionPercent} />
          </div>
          <button className="button button-secondary full" onClick={() => setRecapOpen(true)}><FileText size={17} /> 生成运营快照</button>
        </Card>
      </div>
      {recapOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRecapOpen(false)}>
          <section className="modal weekly-recap-modal" role="dialog" aria-modal="true" aria-label="本周运营快照" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button modal-close" onClick={() => setRecapOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">{weekRange}</span>
            <h2>本周运营快照</h2>
            <p>以下数据来自系统真实记录；复盘不会自动发送给会员。</p>
            <div className="recap-metrics"><span><small>活跃会员</small><b>{realMembers.length}</b><em>人</em></span><span><small>AI 待确认</small><b>{pending}</b><em>条</em></span><span><small>当前会员打卡</small><b>{state.streak}</b><em>天</em></span></div>
            <div className="recap-sections"><article><b>本周执行</b><p>当前会员饮食执行 {nutritionPercent}%、饮水目标 {waterPercent}%，课程完成 {bookingPercent}%。</p></article><article className="warning"><b>待处理</b><p>{pending} 条 AI 建议等待确认，确认后将创建企业微信发送任务。</p></article><article><b>下一步</b><p>进入「课程排期」安排本周私教，并为当前会员完善训练与饮食方案。</p></article></div>
            <div className="session-detail-actions"><button className="button button-secondary" onClick={() => setRecapOpen(false)}>关闭</button><button className="button button-primary" onClick={() => { setRecapOpen(false); openAssistant(); }}><Sparkles size={17} /> 交给 AI 生成建议</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function currentWeekRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcDay = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  const weekday = new Date(utcDay).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(utcDay - daysSinceMonday * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const fmt = (date: Date) => `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

function MemberContextBar({
  member,
  members,
  onSelectMember,
  goTo,
}: {
  member: CoachMember;
  members: CoachMember[];
  onSelectMember: (memberId: string) => void;
  goTo: CoachWorkspaceProps["goTo"];
}) {
  return (
    <section className="member-context-bar">
      <div className="member-context-profile">
        <Avatar name={member.name} size="lg" />
        <div><span className="eyebrow">当前会员</span><h2>{member.name}</h2><small>{member.phone} · {member.plan}</small></div>
      </div>
      <label>切换会员<select data-testid="coach-member-switcher" value={member.id} onChange={(event) => onSelectMember(event.target.value)}>{members.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.goal}</option>)}</select></label>
      <div className="member-context-metrics"><span>当前目标<b>{member.goal}</b></span><span>恢复评分<b>{member.recovery}</b></span><span>下次私教<b>{member.next}</b></span></div>
      <button className="text-button" onClick={() => goTo("coach-members", "/coach/members", "会员管理")}>完整档案 <ArrowRight size={15} /></button>
    </section>
  );
}

function MemberManagement({
  members,
  selectedMemberId,
  onSelectMember,
  goTo,
  profile,
  onUpdateProfile,
}: {
  members: CoachMember[];
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  goTo: CoachWorkspaceProps["goTo"];
  profile: PortalState["profile"];
  onUpdateProfile: (profile: Partial<PortalState["profile"]>) => void;
}) {
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("全部状态");
  const [editing, setEditing] = useState(false);
  const { state } = usePortal();
  const latestFeedback = state.bodyFeedbacks?.at(-1);
  const lastDoneBooking = state.bookings.filter((booking) => booking.status === "已完成").at(-1);
  const nextBooking = state.bookings.find((booking) => !["已完成", "已取消"].includes(booking.status));
  const visibleMembers = members.filter((member) => (!search || `${member.name}${member.phone}${member.goal}`.includes(search)) && (risk === "全部状态" || member.risk === risk));
  const selected = members.find((member) => member.id === selectedMemberId) ?? members[0];
  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onUpdateProfile({
      plan: String(data.get("plan") || profile.plan),
      expiresAt: String(data.get("expiresAt") || profile.expiresAt),
      level: String(data.get("level") || profile.level),
    });
    setEditing(false);
  }
  return (
    <div className="coach-members-layout">
      <Card className="member-directory">
        <div className="member-directory-head">
          <SectionTitle title={`会员档案 · ${visibleMembers.length}`} />
          <div><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="姓名、手机号或目标" /></label><select value={risk} onChange={(event) => setRisk(event.target.value)}><option>全部状态</option><option>良好</option><option>注意</option><option>需关注</option></select></div>
        </div>
        <div className="member-directory-list">
          {visibleMembers.map((member) => (
            <button key={member.id} className={selected.id === member.id ? "active" : ""} onClick={() => onSelectMember(member.id)}>
              <Avatar name={member.name} />
              <span><b>{member.name}</b><small>{member.plan}</small><small>{member.goal}</small></span>
              <div><em className={`risk-badge risk-${member.risk}`}>{member.risk}</em><small>最近 {member.last}</small></div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </Card>
      <div className="member-record">
        <Card className="member-record-hero">
          <div><Avatar name={selected.name} size="lg" /><span><span className="eyebrow">MEMBER ID · {selected.id}</span><h2>{selected.name}</h2><small>{selected.phone} · {selected.plan}</small></span></div>
          <div className="record-hero-stats"><span>当前目标<b>{selected.goal}</b></span><span>恢复评分<b>{selected.recovery > 0 ? `${selected.recovery} / 100` : "待评估"}</b></span><span>出勤率<b>{selected.attendance > 0 ? `${selected.attendance}%` : "待统计"}</b></span><span>下次私教<b>{nextBooking ? `${nextBooking.date} ${nextBooking.time}` : "待安排"}</b></span></div>
          <button className="button button-secondary button-small" onClick={() => setEditing(true)}>编辑会员档案</button>
        </Card>
        <div className="member-service-grid">
          <MemberServiceCard icon={Dumbbell} title="训练方案" text={state.trainingPlan?.phase ? `${state.trainingPlan.phase} · ${state.trainingPlan.focus || "专属训练"}` : "尚未制定训练方案"} note={state.trainingPlan?.updatedAt ? `最近更新 ${state.trainingPlan.updatedAt}` : "等待教练制定"} onClick={() => goTo("coach-training", "/coach/training", "训练方案")} />
          <MemberServiceCard icon={Apple} title="饮食方案" text={state.nutritionPlan?.calories ? `每日 ${state.nutritionPlan.calories} kcal · 蛋白 ${state.nutritionPlan.protein} g` : "尚未制定饮食方案"} note={state.nutritionPlan?.calories ? "由教练维护" : "等待教练制定"} onClick={() => goTo("coach-nutrition", "/coach/nutrition", "饮食方案")} />
          <MemberServiceCard icon={Activity} title="身体反馈" text={latestFeedback ? `${latestFeedback.risk} · ${latestFeedback.date}` : "暂无反馈记录"} note={latestFeedback ? "最近一次身体反馈" : "完成评估后生成"} onClick={() => goTo("coach-body", "/coach/body", "身体反馈")} />
        </div>
        <Card>
          <SectionTitle title="最近服务记录" />
          <div className="record-activity-list">
            <p><CalendarCheck size={18} /><span><b>{lastDoneBooking ? "完成一对一私教" : "暂无已完成课程"}</b><small>{lastDoneBooking ? `${lastDoneBooking.focus || "一对一私教"} · ${lastDoneBooking.date} ${lastDoneBooking.time}` : "完成课程后自动记录"}</small></span></p>
            <p><ClipboardCheck size={18} /><span><b>训练方案</b><small>{state.trainingPlan?.updatedAt ? `最近更新 · ${state.trainingPlan.updatedAt}` : "尚未保存训练方案"}</small></span></p>
            <p><HeartPulse size={18} /><span><b>身体反馈</b><small>{latestFeedback ? `${latestFeedback.risk} · ${latestFeedback.date}` : "尚未记录身体反馈"}</small></span></p>
          </div>
        </Card>
      </div>
      {editing ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(false)}>
          <form className="modal modal-compact" onSubmit={saveProfile} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setEditing(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">MEMBER ID · {selected.id}</span>
            <h2>编辑 {selected.name} 的会员档案</h2>
            <label className="stacked-label">会员计划<input name="plan" defaultValue={profile.id === selected.id ? profile.plan : selected.plan} required /></label>
            <label className="stacked-label">到期日期<input name="expiresAt" type="date" defaultValue={profile.expiresAt.includes("/") ? profile.expiresAt.replaceAll("/", "-") : ""} /></label>
            <label className="stacked-label">会员等级<select name="level" defaultValue={profile.level}><option>会员</option><option>VIP</option><option>尊享会员</option></select></label>
            <button className="button button-primary full" type="submit"><Save size={17} /> 保存会员档案</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

type CustomerConversation = {
  memberId: string;
  memberName: string;
  updatedAt: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
};

function CustomerConversationArchive({
  role,
}: {
  role: "member" | "coach" | "admin";
}) {
  const [items, setItems] = useState<CustomerConversation[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const selected = items.find((item) => item.memberId === selectedMemberId) ?? items[0];

  useEffect(() => {
    portalFetch("/api/customer-conversations", role)
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { conversations?: CustomerConversation[] };
        const conversations = result.conversations ?? [];
        setItems(conversations);
        setSelectedMemberId((current) => current || conversations[0]?.memberId || "");
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [role]);

  return (
    <Card className="customer-conversation-card">
      <SectionTitle title="AI 客服沟通记录" action={<span className="auto-sync-note"><Check size={15} /> 仅显示本人名下会员</span>} />
      <div className="customer-conversation-layout">
        <aside className="customer-conversation-list" aria-label="会员客服会话">
          {items.map((item) => <button key={item.memberId} className={selected?.memberId === item.memberId ? "active" : ""} onClick={() => setSelectedMemberId(item.memberId)}><Avatar name={item.memberName} size="sm" /><span><b>{item.memberName}</b><small>{formatArchiveTime(item.updatedAt)} · {item.turns.length} 条消息</small></span><ChevronRight size={16} /></button>)}
          {!loading && !items.length ? <p>暂无会员客服沟通记录</p> : null}
          {loading ? <p>正在读取客服记录…</p> : null}
        </aside>
        <section className="customer-conversation-thread" aria-live="polite">
          {selected ? <><header><Avatar name={selected.memberName} /><span><b>{selected.memberName}</b><small>普通微信 · AI 健康管理服务</small></span></header><div>{selected.turns.map((turn, index) => <article className={turn.role} key={`${turn.role}-${index}`}><span>{turn.role === "user" ? selected.memberName : "AI 客服"}</span><p>{turn.content.startsWith("[图片]") ? `会员图片摘要：${turn.content.slice(4).trim()}` : turn.content}</p></article>)}</div></> : <div className="customer-conversation-empty"><MessageCircleMore size={28} /><b>选择一位会员查看沟通记录</b><span>这里显示普通微信客服与 Hermes 的真实对话。</span></div>}
        </section>
      </div>
    </Card>
  );
}

function formatArchiveTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(date);
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function bookingDateKey(booking: Booking) {
  const parts = String(booking.date || "").split(/[\/-]/).map(Number);
  if (parts.length === 3) return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
  if (parts.length === 2) return `${new Date().getFullYear()}-${String(parts[0]).padStart(2, "0")}-${String(parts[1]).padStart(2, "0")}`;
  return "";
}

function getWeekDays(anchor: Date) {
  const monday = new Date(anchor);
  const day = monday.getDay() || 7;
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function getMonthDays(anchor: Date) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1, 12);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, index) => new Date(year, month, index + 1, 12)),
  ];
}

function CoachSchedule({
  member,
  bookings,
  addBooking,
  deleteBooking,
}: {
  member: CoachMember;
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, "id">) => void;
  deleteBooking: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Booking | null>(null);
  const [calendarView, setCalendarView] = useState<"list" | "week" | "month">("week");
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [addDate, setAddDate] = useState(() => toDateInput(new Date()));
  const activeBookings = bookings.filter((booking) => booking.status !== "已取消");
  const completed = activeBookings.filter((booking) => booking.status === "已完成").length;
  const pending = activeBookings.filter((booking) => booking.status === "待确认").length;
  const weekDays = getWeekDays(calendarAnchor);
  const monthDays = getMonthDays(calendarAnchor);

  function openAdd(date = new Date()) {
    setAddDate(toDateInput(date));
    setAddOpen(true);
  }

  function moveCalendar(direction: -1 | 1) {
    setCalendarAnchor((current) => {
      const next = new Date(current);
      if (calendarView === "month") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * 7);
      return next;
    });
  }

  function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawDate = String(data.get("date") || "");
    const start = String(data.get("time") || "09:00");
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const endMinutes = startMinutes + 60;
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const date = new Date(`${rawDate}T12:00:00`);
    const day = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    addBooking({
      day,
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      time: `${start}–${end}`,
      title: "一对一私教",
      coach: "邵教练",
      focus: String(data.get("focus") || "一对一私教"),
      status: String(data.get("status") || "已预约") as Booking["status"],
    });
    setAddOpen(false);
  }

  return (
    <>
      <div className="stats-grid four">
        <StatCard icon={CalendarCheck} label="当前会员排期" value={activeBookings.length} suffix="节" note={`已完成 ${completed} 节`} />
        <StatCard icon={Clock3} label="待上课程" value={Math.max(0, activeBookings.length - completed)} suffix="节" note={member.name} accent="amber" />
        <StatCard icon={Check} label="到课率" value={activeBookings.length ? Math.round((completed / activeBookings.length) * 100) : 0} suffix="%" note="按当前排期计算" />
        <StatCard icon={AlertTriangle} label="待确认" value={pending} suffix="节" note="需要教练处理" accent="slate" />
      </div>
      <Card className="coach-schedule-card">
        <SectionTitle title={`${member.name} · 一对一私教排期`} action={<div className="schedule-header-actions"><div className="schedule-range-switch" aria-label="排期视图">{(["list", "week", "month"] as const).map((item) => <button key={item} className={calendarView === item ? "active" : ""} onClick={() => setCalendarView(item)}>{item === "list" ? "列表" : item === "week" ? "周" : "月"}</button>)}</div><button className="button button-primary button-small" onClick={() => openAdd()}><Plus size={16} /> 新增课程</button></div>} />
        {calendarView !== "list" ? <div className="calendar-toolbar"><button className="icon-button" onClick={() => moveCalendar(-1)} aria-label="上一周期">‹</button><b>{calendarView === "week" ? `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}` : `${calendarAnchor.getFullYear()} 年 ${calendarAnchor.getMonth() + 1} 月`}</b><button className="icon-button" onClick={() => moveCalendar(1)} aria-label="下一周期">›</button></div> : null}
        {calendarView === "list" ? <div className="coach-session-list">
          {activeBookings.length ? activeBookings.map((booking) => (
            <article key={booking.id}>
              <button className="coach-session-main" onClick={() => setSelectedSession(booking)}>
                <time><b>{booking.date}</b><span>{booking.day}</span></time>
                <span><b>{booking.time}</b><small>{booking.focus || booking.title}</small></span>
                <em className={`status status-${booking.status}`}>{booking.status}</em>
                <ChevronRight size={17} />
              </button>
              <button className="icon-button danger-icon" onClick={() => setSelectedSession(booking)} aria-label={`删除 ${booking.date} ${booking.time} 课程`}><Trash2 size={17} /></button>
            </article>
          )) : (
            <button className="empty-schedule-action" onClick={() => openAdd()}><Plus size={22} /><b>还没有课程排期</b><span>点击为 {member.name} 安排第一节一对一私教</span></button>
          )}
        </div> : null}
        {calendarView === "week" ? <div className="coach-calendar-scroll"><div className="coach-week-board">{weekDays.map((date) => { const sessions = activeBookings.filter((booking) => bookingDateKey(booking) === toDateInput(date)); return <section key={toDateInput(date)}><header><small>{["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}</small><b>{formatShortDate(date)}</b></header>{sessions.map((booking) => <button key={booking.id} onClick={() => setSelectedSession(booking)}><time>{booking.time}</time><b>{booking.focus || booking.title}</b><small>{booking.status}</small></button>)}<button className="open" onClick={() => openAdd(date)} aria-label={`${formatShortDate(date)} 新增课程`}><Plus size={16} /> 新增</button></section>; })}</div></div> : null}
        {calendarView === "month" ? <div className="coach-calendar-scroll"><div className="coach-month-board"><header>{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</header><div>{monthDays.map((date, index) => date ? <section key={toDateInput(date)} className={toDateInput(date) === toDateInput(new Date()) ? "today" : ""}><button className="month-day-number" onClick={() => openAdd(date)} aria-label={`${formatShortDate(date)} 新增课程`}>{date.getDate()}</button>{activeBookings.filter((booking) => bookingDateKey(booking) === toDateInput(date)).slice(0, 3).map((booking) => <button className="month-session" key={booking.id} onClick={() => setSelectedSession(booking)}><b>{booking.time.split(/[–-]/)[0]}</b><span>{booking.focus || booking.title}</span></button>)}</section> : <span className="month-blank" key={`blank-${index}`} />)}</div></div></div> : null}
      </Card>
      {addOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAddOpen(false)}>
          <form className="modal modal-compact" onSubmit={addSession} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setAddOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">MEMBER ID · {member.id}</span>
            <h2>为 {member.name} 新增一对一私教</h2>
            <label className="stacked-label">上课日期<input name="date" type="date" defaultValue={addDate} required /></label>
            <label className="stacked-label">开始时间<input name="time" type="time" defaultValue="09:00" min="06:00" max="22:00" required /></label>
            <label className="stacked-label">训练重点<input name="focus" defaultValue={member.goal} required maxLength={80} /></label>
            <label className="stacked-label">课程状态<select name="status" defaultValue="已预约"><option>已预约</option><option>待确认</option><option>已完成</option></select></label>
            <button className="button button-primary full" type="submit"><Plus size={17} /> 保存课程排期</button>
          </form>
        </div>
      ) : null}
      {selectedSession ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedSession(null)}>
          <div className="modal modal-compact" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setSelectedSession(null)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">{selectedSession.day} · {selectedSession.date}</span>
            <h2>{selectedSession.time} 一对一私教</h2>
            <p>{member.name} · {selectedSession.focus || member.goal}</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setSelectedSession(null)}>保留课程</button>
              <button className="button button-danger" onClick={() => { deleteBooking(selectedSession.id); setSelectedSession(null); }}><Trash2 size={17} /> 删除课程</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TrainingDesigner({ member, plan, onSave }: { member: CoachMember; plan: TrainingPlan; onSave: (plan: TrainingPlan) => void }) {
  const [draft, setDraft] = useState<TrainingPlan>(() => JSON.parse(JSON.stringify(plan)) as TrainingPlan);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...draft, updatedAt: new Date().toISOString().slice(0, 10) });
  }
  function updateDay(index: number, next: TrainingPlan["days"][number]) {
    setDraft((current) => ({ ...current, days: current.days.map((day, dayIndex) => dayIndex === index ? next : day) }));
  }
  return (
    <div className="coach-design-grid">
      <Card className="plan-editor span-2">
        <SectionTitle title={`${member.name} · 训练方案设计`} action={<select value={draft.phase} onChange={(event) => setDraft((current) => ({ ...current, phase: event.target.value }))}><option>第 1 周</option><option>第 2 周</option><option>第 3 周</option><option>第 4 周</option></select>} />
        <form onSubmit={save}>
          <div className="plan-summary-grid">
            <label>阶段目标<input value={draft.goal} onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))} /></label>
            <label>本周频次<select value={draft.frequency} onChange={(event) => setDraft((current) => ({ ...current, frequency: Number(event.target.value) }))}><option value="2">每周 2 次</option><option value="3">每周 3 次</option><option value="4">每周 4 次</option><option value="5">每周 5 次</option></select></label>
            <label>训练重点<input value={draft.focus} onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))} /></label>
          </div>
          <div className="plan-day-list">
            {draft.days.map((day, index) => <PlanDay key={day.id} index={String(index + 1).padStart(2, "0")} day={day} onChange={(next) => updateDay(index, next)} onRemove={() => setDraft((current) => ({ ...current, days: current.days.filter((_, dayIndex) => dayIndex !== index) }))} />)}
            <button type="button" className="add-plan-day" onClick={() => setDraft((current) => ({ ...current, days: [...current.days, { id: `day-${Date.now()}`, title: "新训练日", duration: "60 分钟", exercises: ["新动作 · 3×10"] }] }))}><Plus size={17} /> 新增训练日</button>
          </div>
          <div className="plan-save-row"><span><AlertTriangle size={17} /> 若膝部不适超过 3/10，停止冲击动作并重新评估。</span><button className="button button-primary" type="submit"><Save size={17} /> 保存并发布给会员</button></div>
        </form>
      </Card>
      <div className="side-stack">
        <Card><SectionTitle title="设计依据" /><div className="evidence-compact"><p><Activity size={18} /><span><b>恢复评分</b><small>{member.recovery > 0 ? `${member.recovery} / 100` : "待评估"}</small></span></p><p><Target size={18} /><span><b>会员目标</b><small>{member.goal}</small></span></p><p><CalendarCheck size={18} /><span><b>出勤率</b><small>{member.attendance > 0 ? `${member.attendance}%` : "待统计"}</small></span></p></div></Card>
        <Card className="coach-note-panel"><SectionTitle title="教练备注" /><textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} rows={7} /><small>备注会随训练方案一起自动保存。</small></Card>
      </div>
    </div>
  );
}

function NutritionDesigner({ member, plan, onSave }: { member: CoachMember; plan: NutritionPlan; onSave: (plan: NutritionPlan) => void }) {
  const [draft, setDraft] = useState<NutritionPlan>(() => JSON.parse(JSON.stringify(plan)) as NutritionPlan);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...draft, updatedAt: new Date().toISOString().slice(0, 10) });
  }
  return (
    <div className="coach-design-grid">
      <Card className="span-2">
        <SectionTitle title={`${member.name} · 饮食方案`} action={<span className="pill">鄂州饮食习惯已考虑</span>} />
        <form onSubmit={save} className="nutrition-designer-form">
          <div className="nutrition-targets">
            <label>每日热量<input type="number" value={draft.calories} onChange={(event) => setDraft((current) => ({ ...current, calories: Number(event.target.value) }))} /><small>kcal</small></label>
            <label>蛋白质<input type="number" value={draft.protein} onChange={(event) => setDraft((current) => ({ ...current, protein: Number(event.target.value) }))} /><small>g</small></label>
            <label>碳水<input type="number" value={draft.carbs} onChange={(event) => setDraft((current) => ({ ...current, carbs: Number(event.target.value) }))} /><small>g</small></label>
            <label>脂肪<input type="number" value={draft.fat} onChange={(event) => setDraft((current) => ({ ...current, fat: Number(event.target.value) }))} /><small>g</small></label>
          </div>
          <div className="coach-meal-plan">
            {draft.meals.map((meal, index) => <div key={meal.type}><span><b>{meal.type}</b><input className="meal-time-input" aria-label={`${meal.type}时间`} type="time" value={meal.time} onChange={(event) => setDraft((current) => ({ ...current, meals: current.meals.map((item, mealIndex) => mealIndex === index ? { ...item, time: event.target.value } : item) }))} /></span><input aria-label={`${meal.type}内容`} value={meal.food} onChange={(event) => setDraft((current) => ({ ...current, meals: current.meals.map((item, mealIndex) => mealIndex === index ? { ...item, food: event.target.value } : item) }))} /><label className="meal-calorie-field"><input aria-label={`${meal.type}热量`} type="number" value={meal.calories} onChange={(event) => setDraft((current) => ({ ...current, meals: current.meals.map((item, mealIndex) => mealIndex === index ? { ...item, calories: Number(event.target.value) } : item) }))} /><em>kcal</em></label></div>)}
          </div>
          <label className="full-note">执行提醒<textarea rows={4} value={draft.reminder} onChange={(event) => setDraft((current) => ({ ...current, reminder: event.target.value }))} /></label>
          <button className="button button-primary" type="submit"><Save size={17} /> 保存并发布给会员</button>
        </form>
      </Card>
      <div className="side-stack">
        <Card><SectionTitle title="近 7 天执行" /><QualityRow label="热量达标" value={86} /><QualityRow label="蛋白质达标" value={92} /><QualityRow label="饮水达标" value={72} /></Card>
        <Card className="warning-card"><AlertTriangle size={22} /><div><b>调整提示</b><p>根据会员身体反馈与饮食执行记录调整方案；如会员反馈疼痛或不适，请先降低负荷并复核动作。</p></div></Card>
      </div>
    </div>
  );
}

function BodyFeedback({
  member,
  data,
  feedbacks,
  onSave,
}: {
  member: CoachMember;
  data: BodyMetric[];
  feedbacks: PortalState["bodyFeedbacks"];
  onSave: (feedback: { summary: string; nextFocus: string; risk: "良好" | "注意" | "需关注" }) => void;
}) {
  const [metric, setMetric] = useState<"weight" | "bodyFat" | "muscle">("weight");
  const latestFeedback = feedbacks.at(-1);
  const [summary, setSummary] = useState(latestFeedback?.summary ?? "");
  const [nextFocus, setNextFocus] = useState(latestFeedback?.nextFocus ?? "");
  const [risk, setRisk] = useState<"良好" | "注意" | "需关注">(latestFeedback?.risk ?? (member.risk as "良好" | "注意" | "需关注"));
  const latest = data.at(-1);
  const labels = { weight: "体重", bodyFat: "体脂率", muscle: "肌肉量" };
  return (
    <div className="coach-body-layout">
      <div className="stats-grid four">
        <StatCard icon={Activity} label="恢复评分" value={member.recovery > 0 ? member.recovery : "—"} suffix={member.recovery > 0 ? "/ 100" : ""} note={member.recovery > 0 ? member.risk : "待评估"} accent={member.risk === "良好" ? "green" : "amber"} />
        <StatCard icon={Target} label="当前体重" value={latest?.weight ?? "—"} suffix={latest ? "kg" : ""} note={latest ? "最近一次记录" : "暂无记录"} />
        <StatCard icon={HeartPulse} label="体脂率" value={latest?.bodyFat ?? "—"} suffix={latest ? "%" : ""} note={latest ? "最近一次记录" : "暂无记录"} accent="amber" />
        <StatCard icon={Dumbbell} label="肌肉量" value={latest?.muscle ?? "—"} suffix={latest ? "kg" : ""} note={latest ? "最近一次记录" : "暂无记录"} accent="slate" />
      </div>
      <div className="content-grid-2">
        <Card>
          <SectionTitle title={`${member.name} · ${labels[metric]}趋势`} action={<div className="segmented"><button className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>体重</button><button className={metric === "bodyFat" ? "active" : ""} onClick={() => setMetric("bodyFat")}>体脂</button><button className={metric === "muscle" ? "active" : ""} onClick={() => setMetric("muscle")}>肌肉</button></div>} />
          <TrendChart data={data as unknown as Record<string, unknown>[]} dataKey={metric} height={300} />
        </Card>
        <Card className="feedback-form-card">
          <SectionTitle title="教练身体反馈" />
          <div className="risk-summary"><label>风险等级<select value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}><option>良好</option><option>注意</option><option>需关注</option></select></label><p>恢复评分较上周上升 6 分，可维持正常训练负荷；继续观察睡眠与膝部反馈。</p></div>
          <label>本周反馈<textarea rows={7} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
          <label>下周观察重点<input value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} /></label>
          <button className="button button-primary full" onClick={() => onSave({ summary, nextFocus, risk })}><Send size={17} /> 保存并发布给会员</button>
          {feedbacks.length ? <div className="feedback-history"><b>历史反馈</b>{feedbacks.slice(-3).reverse().map((feedback) => <p key={feedback.id}><span>{feedback.date}</span>{feedback.summary}</p>)}</div> : null}
        </Card>
      </div>
    </div>
  );
}

function MemberServiceCard({ icon: Icon, title, text, note, onClick }: { icon: typeof Dumbbell; title: string; text: string; note: string; onClick: () => void }) {
  return <button className="card member-service-card" onClick={onClick}><span><Icon size={22} /></span><div><h3>{title}</h3><p>{text}</p><small>{note}</small></div><ArrowRight size={18} /></button>;
}

function PlanDay({
  index,
  day,
  onChange,
  onRemove,
}: {
  index: string;
  day: TrainingPlan["days"][number];
  onChange: (day: TrainingPlan["days"][number]) => void;
  onRemove: () => void;
}) {
  return <section><header><span>{index}</span><div><input className="plan-day-title" value={day.title} onChange={(event) => onChange({ ...day, title: event.target.value })} aria-label={`训练日 ${index} 标题`} /><input className="plan-day-duration" value={day.duration} onChange={(event) => onChange({ ...day, duration: event.target.value })} aria-label={`训练日 ${index} 时长`} /></div><button type="button" className="text-button danger-text" onClick={onRemove}><Trash2 size={14} /> 删除</button></header><div>{day.exercises.map((exercise, exerciseIndex) => <label key={`${day.id}-${exerciseIndex}`}><Check size={14} /><input value={exercise} onChange={(event) => onChange({ ...day, exercises: day.exercises.map((item, indexValue) => indexValue === exerciseIndex ? event.target.value : item) })} /><button type="button" className="icon-button" aria-label={`删除动作 ${exercise}`} onClick={() => onChange({ ...day, exercises: day.exercises.filter((_, indexValue) => indexValue !== exerciseIndex) })}><X size={14} /></button></label>)}</div><button type="button" className="text-button" onClick={() => onChange({ ...day, exercises: [...day.exercises, "新动作 · 3×10"] })}><Plus size={14} /> 添加动作</button></section>;
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return <div className="quality-row"><div className="row-between"><span>{label}</span><b>{value}%</b></div><ProgressBar value={value} tone={value < 75 ? "amber" : "green"} /></div>;
}
