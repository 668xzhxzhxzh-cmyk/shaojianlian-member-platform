"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  FileText,
  HeartPulse,
  MessageCircleMore,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Target,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { memberRows, type BodyMetric } from "@/lib/portal-data";
import { usePortal } from "./portal-context";
import { Avatar, Card, ProgressBar, SectionTitle, StatCard, TrendChart } from "./ui";

export type CoachSection = "overview" | "members" | "schedule" | "training" | "nutrition" | "body";
type CoachMember = (typeof memberRows)[number];

type CoachWorkspaceProps = {
  section: CoachSection;
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  goTo: (view: string, href?: string, label?: string) => void;
  openAssistant: () => void;
};

const coachSchedule = [
  { time: "08:00", member: "李明远", focus: "下肢力量与髋稳定", status: "已完成" },
  { time: "09:30", member: "王雨桐", focus: "体态评估与肩颈松解", status: "待开始" },
  { time: "11:00", member: "张小北", focus: "上肢拉力与核心", status: "待开始" },
  { time: "14:00", member: "陈思颖", focus: "核心重建", status: "待开始" },
  { time: "16:00", member: "刘一航", focus: "膝关节活动度", status: "待确认" },
];

export function CoachWorkspace({
  section,
  selectedMemberId,
  onSelectMember,
  goTo,
  openAssistant,
}: CoachWorkspaceProps) {
  const { state, notify } = usePortal();
  const [members, setMembers] = useState<CoachMember[]>(memberRows);
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0];
  const sectionLabels: Record<CoachSection, string> = {
    overview: "工作台",
    members: "会员管理",
    schedule: "课程排期",
    training: "训练方案",
    nutrition: "饮食方案",
    body: "身体反馈",
  };

  useEffect(() => {
    fetch("/api/users", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { users?: Array<{ id: string; name: string; phone: string; role: string; status: string }> };
        const actualMembers = result.users?.filter((user) => Boolean(user.id) && user.role === "member" && user.status === "active") ?? [];
        if (!actualMembers.length) return;
        setMembers(actualMembers.map((user, index) => ({
          ...memberRows[index % memberRows.length],
          id: user.id,
          name: user.name,
          phone: user.phone,
        })));
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="view-stack coach-workspace">
      {section === "overview" ? (
        <CoachOverview
          openAssistant={openAssistant}
          goTo={goTo}
          onSelectMember={onSelectMember}
          members={members}
        />
      ) : (
        <>
          <section className="coach-section-heading">
            <div>
              <span className="eyebrow">教练工作台 · {sectionLabels[section]}</span>
              <h1>{sectionLabels[section]}</h1>
              <p>{section === "members" ? "先进入会员档案，再围绕同一位会员安排训练、饮食和身体反馈。" : `当前正在为 ${selectedMember.name} 处理专属服务。`}</p>
            </div>
            <button className="button button-secondary" onClick={() => notify("会员数据已同步")}><RefreshCcw size={17} /> 同步数据</button>
          </section>
          {section !== "members" && section !== "schedule" ? (
            <MemberContextBar member={selectedMember} members={members} onSelectMember={onSelectMember} goTo={goTo} />
          ) : null}
          {section === "members" ? <MemberManagement members={members} selectedMemberId={selectedMember.id} onSelectMember={onSelectMember} goTo={goTo} /> : null}
          {section === "schedule" ? <CoachSchedule members={members} notify={notify} /> : null}
          {section === "training" ? <TrainingDesigner member={selectedMember} notify={notify} /> : null}
          {section === "nutrition" ? <NutritionDesigner member={selectedMember} notify={notify} /> : null}
          {section === "body" ? <BodyFeedback member={selectedMember} data={state.bodyMetrics} notify={notify} /> : null}
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
  const { state, notify } = usePortal();
  const pending = state.suggestions.filter((item) => item.status === "待确认").length;
  return (
    <>
      <section className="coach-hero-row">
        <div>
          <span className="eyebrow">教练运营总览</span>
          <h1>上午好，邵教练</h1>
          <p>先处理今天的私教课，再跟进需要调整方案的会员。</p>
        </div>
        <div className="inline-actions">
          <button className="button button-secondary" onClick={openAssistant}><Sparkles size={17} /> Hermes 工作台</button>
          <button className="button button-primary" onClick={() => goTo("coach-members", "/coach/members", "会员管理")}><UserRoundPlus size={17} /> 管理会员</button>
        </div>
      </section>
      <div className="stats-grid four coach-kpis">
        <StatCard icon={CalendarDays} label="今日一对一私教" value="5" suffix="节" note="首节 08:00" onClick={() => goTo("coach-schedule", "/coach/schedule", "课程排期")} />
        <StatCard icon={UsersRound} label="活跃会员" value="28" suffix="人" note="3 人需要跟进" onClick={() => goTo("coach-members", "/coach/members", "会员管理")} />
        <StatCard icon={AlertTriangle} label="身体风险提醒" value="3" suffix="项" note="1 项需今日处理" accent="amber" onClick={() => goTo("coach-body", "/coach/body", "身体反馈")} />
        <StatCard icon={Sparkles} label="Hermes 待确认" value={pending} suffix="条" note="确认后创建企微任务" accent="slate" onClick={openAssistant} />
      </div>
      <div className="coach-overview-grid">
        <Card className="coach-today-card span-2">
          <SectionTitle title="今日私教安排" action={<button className="text-button" onClick={() => goTo("coach-schedule", "/coach/schedule", "课程排期")}>完整排期 <ArrowRight size={15} /></button>} />
          <div className="coach-timeline">
            {coachSchedule.map((item, index) => {
              const member = members[index % members.length];
              return (
              <button key={item.time} onClick={() => {
                if (member) onSelectMember(member.id);
                goTo("coach-training", "/coach/training", "训练方案");
              }}>
                <time>{item.time}</time>
                <i className={index === 0 ? "done" : index === 1 ? "active" : ""} />
                <Avatar name={member?.name ?? item.member} size="sm" />
                <span><b>{member?.name ?? item.member}</b><small>{item.focus}</small></span>
                <em>{item.status}</em>
                <ChevronRight size={16} />
              </button>
              );
            })}
          </div>
        </Card>
        <Card>
          <SectionTitle title="今日优先事项" />
          <div className="priority-list">
            <button onClick={() => goTo("coach-body", "/coach/body", "身体反馈")}><AlertTriangle size={19} /><span><b>刘一航 · 膝部不适</b><small>训练前完成风险复核</small></span><em>高</em></button>
            <button onClick={() => goTo("coach-nutrition", "/coach/nutrition", "饮食方案")}><Apple size={19} /><span><b>王雨桐 · 摄入不足</b><small>调整今日餐单</small></span><em>中</em></button>
            <button onClick={openAssistant}><MessageCircleMore size={19} /><span><b>{pending} 条建议待确认</b><small>由教练确认后创建企微任务</small></span><em>待办</em></button>
          </div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="会员状态快照" action={<button className="text-button" onClick={() => goTo("coach-members", "/coach/members", "会员管理")}>查看全部会员 <ArrowRight size={15} /></button>} />
          <div className="member-snapshot-grid">
            {members.slice(0, 4).map((member) => (
              <button key={member.id} onClick={() => {
                onSelectMember(member.id);
                goTo("coach-members", "/coach/members", "会员管理");
              }}>
                <div><Avatar name={member.name} /><span><b>{member.name}</b><small>{member.plan}</small></span><em className={`risk-badge risk-${member.risk}`}>{member.risk}</em></div>
                <p>{member.goal}</p>
                <div className="snapshot-metrics"><span>恢复 <b>{member.recovery}%</b></span><span>出勤 <b>{member.attendance}%</b></span><span>下次 <b>{member.next}</b></span></div>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="本周执行质量" />
          <div className="quality-list">
            <QualityRow label="训练计划完成率" value={82} />
            <QualityRow label="私教到课率" value={94} />
            <QualityRow label="饮食记录完整度" value={76} />
            <QualityRow label="身体数据更新率" value={68} />
          </div>
          <button className="button button-secondary full" onClick={() => notify("本周复盘报告已生成", "info")}><FileText size={17} /> 生成本周复盘</button>
        </Card>
      </div>
    </>
  );
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
      <label>切换会员<select value={member.id} onChange={(event) => onSelectMember(event.target.value)}>{members.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.goal}</option>)}</select></label>
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
}: {
  members: CoachMember[];
  selectedMemberId: string;
  onSelectMember: (memberId: string) => void;
  goTo: CoachWorkspaceProps["goTo"];
}) {
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("全部状态");
  const visibleMembers = members.filter((member) => (!search || `${member.name}${member.phone}${member.goal}`.includes(search)) && (risk === "全部状态" || member.risk === risk));
  const selected = members.find((member) => member.id === selectedMemberId) ?? members[0];
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
          <div className="record-hero-stats"><span>当前目标<b>{selected.goal}</b></span><span>恢复评分<b>{selected.recovery} / 100</b></span><span>出勤率<b>{selected.attendance}%</b></span><span>下次私教<b>{selected.next}</b></span></div>
        </Card>
        <div className="member-service-grid">
          <MemberServiceCard icon={Dumbbell} title="训练方案" text="第 3 周 · 下肢力量与核心稳定" note="昨天已更新" onClick={() => goTo("coach-training", "/coach/training", "训练方案")} />
          <MemberServiceCard icon={Apple} title="饮食方案" text="每日 1,800 kcal · 蛋白 120 g" note="执行率 86%" onClick={() => goTo("coach-nutrition", "/coach/nutrition", "饮食方案")} />
          <MemberServiceCard icon={Activity} title="身体反馈" text={`恢复评分 ${selected.recovery} · ${selected.risk}`} note="今日待复核" onClick={() => goTo("coach-body", "/coach/body", "身体反馈")} />
        </div>
        <Card>
          <SectionTitle title="最近服务记录" />
          <div className="record-activity-list">
            <p><CalendarCheck size={18} /><span><b>完成一对一私教</b><small>下肢力量与髋稳定 · 昨天 18:00</small></span></p>
            <p><ClipboardCheck size={18} /><span><b>训练方案已调整</b><small>深蹲负荷下调 5% · 7 月 28 日</small></span></p>
            <p><HeartPulse size={18} /><span><b>身体反馈已记录</b><small>睡眠不足，恢复评分下降 · 7 月 27 日</small></span></p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CoachSchedule({ members, notify }: { members: CoachMember[]; notify: (message: string, tone?: "success" | "info" | "warning") => void }) {
  const days = ["周一 7/27", "周二 7/28", "周三 7/29", "周四 7/30", "周五 7/31", "周六 8/1", "周日 8/2"];
  return (
    <>
      <div className="stats-grid four">
        <StatCard icon={CalendarCheck} label="本周私教" value="32" suffix="节" note="已完成 18 节" />
        <StatCard icon={Clock3} label="可约时段" value="9" suffix="个" note="周五晚间最紧张" accent="amber" />
        <StatCard icon={Check} label="到课率" value="94" suffix="%" note="较上周 +3%" />
        <StatCard icon={AlertTriangle} label="待确认" value="3" suffix="节" note="今天内处理" accent="slate" />
      </div>
      <Card className="coach-schedule-card">
        <SectionTitle title="本周一对一私教排期" action={<button className="button button-primary button-small" onClick={() => notify("新增私教排期面板已准备", "info")}><Plus size={16} /> 新增排期</button>} />
        <div className="coach-week-board">
          {days.map((day, dayIndex) => (
            <section key={day}>
              <header><b>{day.split(" ")[0]}</b><span>{day.split(" ")[1]}</span></header>
              {[9, 11, 14, 16, 18].map((hour, slotIndex) => {
                const booked = (dayIndex + slotIndex) % 3 !== 1;
                const member = members[(dayIndex + slotIndex) % members.length];
                return <button key={hour} className={booked ? "booked" : "open"} onClick={() => notify(booked ? `${day} ${hour}:00 · ${member.name} 一对一私教` : `${day} ${hour}:00 可新增一对一私教`, "info")}><time>{hour}:00</time>{booked ? <><b>{member.name}</b><small>{member.goal}</small></> : <><Plus size={15} /><b>可安排</b><small>一对一私教</small></>}</button>;
              })}
            </section>
          ))}
        </div>
      </Card>
    </>
  );
}

function TrainingDesigner({ member, notify }: { member: (typeof memberRows)[number]; notify: (message: string, tone?: "success" | "info" | "warning") => void }) {
  const [phase, setPhase] = useState("第 3 周");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notify(`${member.name} 的训练方案已保存`);
  }
  return (
    <div className="coach-design-grid">
      <Card className="plan-editor span-2">
        <SectionTitle title={`${member.name} · 训练方案设计`} action={<select value={phase} onChange={(event) => setPhase(event.target.value)}><option>第 1 周</option><option>第 2 周</option><option>第 3 周</option><option>第 4 周</option></select>} />
        <form onSubmit={save}>
          <div className="plan-summary-grid">
            <label>阶段目标<input defaultValue={member.goal} /></label>
            <label>本周频次<select defaultValue="3"><option value="2">每周 2 次</option><option value="3">每周 3 次</option><option value="4">每周 4 次</option></select></label>
            <label>训练重点<input defaultValue="下肢力量、核心稳定、动作质量" /></label>
          </div>
          <div className="plan-day-list">
            <PlanDay index="01" title="下肢力量与髋稳定" duration="70 分钟" exercises={["高脚杯深蹲 · 4×10", "罗马尼亚硬拉 · 4×10", "保加利亚分腿蹲 · 3×10", "死虫式 · 3×12"]} />
            <PlanDay index="02" title="上肢拉力与肩胛控制" duration="65 分钟" exercises={["高位下拉 · 4×10", "坐姿划船 · 4×12", "面拉 · 3×15", "农夫行走 · 4×30m"]} />
            <PlanDay index="03" title="全身整合与心肺" duration="60 分钟" exercises={["壶铃硬拉 · 4×12", "台阶蹬踏 · 3×12", "雪橇推 · 6×20m", "低强度有氧 · 15min"]} />
          </div>
          <div className="plan-save-row"><span><AlertTriangle size={17} /> 若膝部不适超过 3/10，停止冲击动作并重新评估。</span><button className="button button-primary" type="submit"><Save size={17} /> 保存并发布给会员</button></div>
        </form>
      </Card>
      <div className="side-stack">
        <Card><SectionTitle title="设计依据" /><div className="evidence-compact"><p><Activity size={18} /><span><b>恢复评分</b><small>{member.recovery} / 100</small></span></p><p><Target size={18} /><span><b>会员目标</b><small>{member.goal}</small></span></p><p><CalendarCheck size={18} /><span><b>出勤率</b><small>{member.attendance}%</small></span></p></div></Card>
        <Card className="coach-note-panel"><SectionTitle title="教练备注" /><textarea defaultValue="动作质量优先，训练中保持 RPE 7–8。根据当天恢复状态决定是否增加最后一组。" rows={7} /><button className="button button-secondary full" onClick={() => notify("教练备注已保存")}>保存备注</button></Card>
      </div>
    </div>
  );
}

function NutritionDesigner({ member, notify }: { member: (typeof memberRows)[number]; notify: (message: string, tone?: "success" | "info" | "warning") => void }) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    notify(`${member.name} 的饮食方案已保存`);
  }
  return (
    <div className="coach-design-grid">
      <Card className="span-2">
        <SectionTitle title={`${member.name} · 饮食方案`} action={<span className="pill">武汉饮食习惯已考虑</span>} />
        <form onSubmit={save} className="nutrition-designer-form">
          <div className="nutrition-targets">
            <label>每日热量<input type="number" defaultValue="1800" /><small>kcal</small></label>
            <label>蛋白质<input type="number" defaultValue="120" /><small>g</small></label>
            <label>碳水<input type="number" defaultValue="180" /><small>g</small></label>
            <label>脂肪<input type="number" defaultValue="60" /><small>g</small></label>
          </div>
          <div className="coach-meal-plan">
            {[
              ["早餐", "07:30", "燕麦粥、鸡蛋、无糖牛奶、蓝莓", "450 kcal"],
              ["午餐", "12:30", "糙米饭、清蒸鱼、西兰花、菌菇", "550 kcal"],
              ["加餐", "16:00", "香蕉、无糖酸奶", "200 kcal"],
              ["晚餐", "19:00", "鸡胸肉、红薯、菠菜、豆腐", "500 kcal"],
            ].map(([type, time, food, calories]) => <label key={type}><span><b>{type}</b><small>{time}</small></span><input defaultValue={food} /><em>{calories}</em></label>)}
          </div>
          <label className="full-note">执行提醒<textarea rows={4} defaultValue="训练日前后优先保证碳水；武汉口味可保留清淡汤类，减少重油、含糖饮料与夜宵。" /></label>
          <button className="button button-primary" type="submit"><Save size={17} /> 保存并发布给会员</button>
        </form>
      </Card>
      <div className="side-stack">
        <Card><SectionTitle title="近 7 天执行" /><QualityRow label="热量达标" value={86} /><QualityRow label="蛋白质达标" value={92} /><QualityRow label="饮水达标" value={72} /></Card>
        <Card className="warning-card"><AlertTriangle size={22} /><div><b>调整提示</b><p>最近两次私教后饥饿感较强，建议训练日增加 100–150 kcal 复合碳水。</p></div></Card>
      </div>
    </div>
  );
}

function BodyFeedback({
  member,
  data,
  notify,
}: {
  member: (typeof memberRows)[number];
  data: BodyMetric[];
  notify: (message: string, tone?: "success" | "info" | "warning") => void;
}) {
  const [metric, setMetric] = useState<"weight" | "bodyFat" | "muscle">("weight");
  const latest = data.at(-1);
  const labels = { weight: "体重", bodyFat: "体脂率", muscle: "肌肉量" };
  return (
    <div className="coach-body-layout">
      <div className="stats-grid four">
        <StatCard icon={Activity} label="恢复评分" value={member.recovery} suffix="/ 100" note={member.risk} accent={member.risk === "良好" ? "green" : "amber"} />
        <StatCard icon={Target} label="当前体重" value={latest?.weight ?? "67.9"} suffix="kg" note="近 30 天 -1.9 kg" />
        <StatCard icon={HeartPulse} label="体脂率" value={latest?.bodyFat ?? "14.2"} suffix="%" note="节奏稳定" accent="amber" />
        <StatCard icon={Dumbbell} label="肌肉量" value={latest?.muscle ?? "35.4"} suffix="kg" note="近 30 天 +0.8 kg" accent="slate" />
      </div>
      <div className="content-grid-2">
        <Card>
          <SectionTitle title={`${member.name} · ${labels[metric]}趋势`} action={<div className="segmented"><button className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>体重</button><button className={metric === "bodyFat" ? "active" : ""} onClick={() => setMetric("bodyFat")}>体脂</button><button className={metric === "muscle" ? "active" : ""} onClick={() => setMetric("muscle")}>肌肉</button></div>} />
          <TrendChart data={data as unknown as Record<string, unknown>[]} dataKey={metric} height={300} />
        </Card>
        <Card className="feedback-form-card">
          <SectionTitle title="教练身体反馈" />
          <div className="risk-summary"><span className={`risk-badge risk-${member.risk}`}>{member.risk}</span><p>恢复评分较上周上升 6 分，可维持正常训练负荷；继续观察睡眠与膝部反馈。</p></div>
          <label>本周反馈<textarea rows={7} defaultValue="本周体重和体脂下降节奏稳定，肌肉量保持良好。下一阶段继续以动作质量和稳定训练频率为主。" /></label>
          <label>下周观察重点<input defaultValue="睡眠时长、膝部疼痛评分、训练后恢复" /></label>
          <button className="button button-primary full" onClick={() => notify(`${member.name} 的身体反馈已保存并发布`)}><Send size={17} /> 保存并发布给会员</button>
        </Card>
      </div>
    </div>
  );
}

function MemberServiceCard({ icon: Icon, title, text, note, onClick }: { icon: typeof Dumbbell; title: string; text: string; note: string; onClick: () => void }) {
  return <button className="card member-service-card" onClick={onClick}><span><Icon size={22} /></span><div><h3>{title}</h3><p>{text}</p><small>{note}</small></div><ArrowRight size={18} /></button>;
}

function PlanDay({ index, title, duration, exercises }: { index: string; title: string; duration: string; exercises: string[] }) {
  return <section><header><span>{index}</span><div><h3>{title}</h3><small>{duration}</small></div><button type="button" className="text-button">编辑</button></header><div>{exercises.map((exercise) => <label key={exercise}><Check size={14} /><input defaultValue={exercise} /></label>)}</div></section>;
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return <div className="quality-row"><div className="row-between"><span>{label}</span><b>{value}%</b></div><ProgressBar value={value} tone={value < 75 ? "amber" : "green"} /></div>;
}
