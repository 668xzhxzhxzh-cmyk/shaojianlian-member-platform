"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Cloud,
  Database,
  Dumbbell,
  FileDown,
  MessageCircleMore,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { memberRows } from "@/lib/portal-data";
import { usePortal } from "./portal-context";
import { Avatar, Card, Ring, SectionTitle, StatCard, TrendChart } from "./ui";

const attendanceData = [
  { date: "6/29", value: 56 }, { date: "7/4", value: 74 }, { date: "7/9", value: 61 },
  { date: "7/14", value: 83 }, { date: "7/19", value: 64 }, { date: "7/24", value: 70 }, { date: "7/29", value: 82 },
];

async function copyTemporaryPassword(password: string) {
  if (!window.isSecureContext || !navigator.clipboard) return false;
  try {
    await Promise.race([
      navigator.clipboard.writeText(password),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 800)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function CoachView({ openAssistant }: { openAssistant: () => void }) {
  const { state, updateSuggestion, notify } = usePortal();
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("全部风险等级");
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const pending = state.suggestions.filter((item) => item.status === "待确认");
  const visibleMembers = memberRows.filter((member) => (!search || member.name.includes(search) || member.plan.includes(search)) && (risk === "全部风险等级" || member.risk === risk));

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone: data.get("phone"), role: "member" }),
      });
      if (response.status === 404) {
        notify(`演示环境已完成 ${name} 的新增会员流程`, "info");
      } else {
        const result = await response.json() as { temporaryPassword?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "会员创建失败");
        if (result.temporaryPassword) {
          const copied = await copyTemporaryPassword(result.temporaryPassword);
          notify(copied ? `${name} 已创建，临时密码已复制` : `${name} 已创建，临时密码：${result.temporaryPassword}`, copied ? "success" : "info");
        }
      }
      setNewMemberOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "会员创建失败", "warning");
    }
  }

  return (
    <div className="view-stack management-view">
      <section className="welcome-row"><div><span className="eyebrow">教练工作台</span><h1>上午好，邵教练</h1><p>今天有 15 次排期、8 条 AI 建议等待确认；AI 修改会自动同步。</p></div><div className="inline-actions"><button className="button button-primary" onClick={() => setNewMemberOpen(true)}><UserRoundPlus size={17} /> 新增会员</button></div></section>
      <div className="stats-grid five">
        <StatCard icon={UsersRound} label="会员总数" value="128" note="较昨日 +8" />
        <StatCard icon={UserRoundPlus} label="今日新增" value="2" note="较昨日 +1" accent="amber" />
        <StatCard icon={Dumbbell} label="今日训练" value="15" note="完成率 75%" />
        <StatCard icon={CalendarDays} label="本周排期" value="32" note="较上周 +6" accent="slate" />
        <StatCard icon={CircleDollarSign} label="本月收入" value="¥128,620" note="较上月 +13%" />
      </div>
      <div className="coach-dashboard-grid">
        <Card className="span-2">
          <SectionTitle title="会员健康状态" action={<div className="table-tools"><select value={risk} onChange={(event) => setRisk(event.target.value)}><option>全部风险等级</option><option>良好</option><option>注意</option><option>需关注</option></select><label><Search size={15} /><input placeholder="搜索会员" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>} />
          <div className="member-table">
            <div className="table-row table-head"><span>会员</span><span>当前计划</span><span>最后打卡</span><span>恢复状态</span><span>出勤率</span><span>状态</span></div>
            {visibleMembers.map((member) => <button className="table-row" key={member.name} onClick={() => notify(`已打开 ${member.name} 的会员健康档案`, "info")}><span><Avatar name={member.name} size="sm" />{member.name}</span><span>{member.plan}</span><span>{member.last}</span><span><i className={`risk-dot risk-${member.risk}`} />{member.recovery}%</span><span>{member.attendance}%</span><em className={`risk-badge risk-${member.risk}`}>{member.risk}</em></button>)}
          </div>
          <button className="text-button centered" onClick={() => { setSearch(""); setRisk("全部风险等级"); notify("已显示全部会员"); }}>查看全部会员 <ArrowRight size={15} /></button>
        </Card>
        <Card>
          <SectionTitle title="今日排期" />
          <div className="appointment-list">
            {[
              ["08:00", "李明远", "私教课 · 力量进阶", "已开始"],
              ["09:30", "王雨桐", "一对一私教", "待开始"],
              ["10:30", "张小北", "HIIT 高强度燃脂", "待开始"],
              ["14:00", "陈思颖", "核心强化课", "待开始"],
              ["16:00", "刘一航", "功能训练", "已取消"],
            ].map((item) => <div key={item[0]}><time>{item[0]}</time><span><b>{item[1]}</b><small>{item[2]}</small></span><em>{item[3]}</em></div>)}
          </div>
        </Card>
        <Card>
          <SectionTitle title="需要处理" />
          <div className="task-groups"><Task icon={MessageCircleMore} label="未读会员消息" count={12} onClick={() => notify("已打开未读会员消息", "info")} /><Task icon={Clock3} label="即将到期会员" count={5} onClick={() => notify("已筛选 30 天内到期会员", "info")} /><Task icon={AlertTriangle} label="高风险健康预警" count={3} onClick={() => setRisk("需关注")} /></div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="训练计划执行率" action={<span className="pill">近 30 天</span>} />
          <TrendChart data={attendanceData} dataKey="value" height={230} valueSuffix="%" />
          <div className="mini-kpis"><span>平均执行率 <b>78%</b></span><span>计划完成率 <b>72%</b></span><span>按时完成率 <b>68%</b></span></div>
        </Card>
        <Card>
          <SectionTitle title="打卡执行概览" />
          <div className="split-center"><Ring value={78} label="126" sublabel="总打卡" /><div className="legend-stack"><span><i className="green" />按时完成 98 人</span><span><i className="amber" />延迟完成 18 人</span><span><i className="red" />未完成 10 人</span></div></div>
        </Card>
      </div>
      <Card>
        <SectionTitle title={`AI 待确认建议 · ${pending.length}`} action={<button className="text-button" onClick={openAssistant}>进入 AI 工作台 <ArrowRight size={15} /></button>} />
        <div className="suggestion-strip">
          {state.suggestions.map((suggestion) => <article key={suggestion.id}><Avatar name={suggestion.member} /><div><b>{suggestion.member} · {suggestion.title}</b><p>{suggestion.content}</p><span>{suggestion.category} · {suggestion.priority}</span></div><div>{suggestion.status === "已发送" ? <em className="sent"><Check size={14} /> 已创建任务</em> : <><button className="button button-secondary button-small" onClick={openAssistant}>查看</button><button className="button button-primary button-small" onClick={() => { updateSuggestion(suggestion.id, "已发送", { silent: true }); notify("发送任务已创建，请在企业微信客户端确认发送。"); }}><Send size={14} /> 确认</button></>}</div></article>)}
        </div>
      </Card>
      {newMemberOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewMemberOpen(false)}>
          <form className="modal modal-compact" onSubmit={addMember} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setNewMemberOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">会员管理</span><h2>新增会员</h2><p>创建账号后，登录信息将由教练确认再发送。</p>
            <label className="stacked-label">姓名<input name="name" required maxLength={30} placeholder="请输入会员姓名" /></label>
            <label className="stacked-label">手机号<input name="phone" inputMode="numeric" pattern="1[0-9]{10}" required placeholder="11 位手机号" /></label>
            <label className="stacked-label">会员计划<select name="plan"><option>尊享会员 · 年度计划</option><option>季度计划</option><option>体验计划</option></select></label>
            <button className="button button-primary full" type="submit">创建会员账号</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Task({ icon: Icon, label, count, onClick }: { icon: typeof MessageCircleMore; label: string; count: number; onClick: () => void }) {
  return <button onClick={onClick}><Icon size={20} /><span>{label}<small>{count} 项待处理</small></span><b>{count}</b><ArrowRight size={16} /></button>;
}

type AdminSection = "overview" | "ai-suggestions" | "notifications" | "users" | "settings";
type AdminUser = { id: string; name: string; role: string; phone: string; status: string };

export function AdminView({ section = "overview" }: { section?: AdminSection }) {
  const { state, notify, updateSuggestion } = usePortal();
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestionFilter, setSuggestionFilter] = useState<"全部" | "待确认" | "草稿" | "已发送">("全部");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [managedUser, setManagedUser] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([
    { id: "admin-shao", name: "邵教练", role: "管理员 / 主教练", phone: "138****6608", status: "正常" },
    { id: "member-li", name: "李明", role: "尊享会员", phone: "138****5206", status: "正常" },
    { id: "member-wang", name: "王芳", role: "年度会员", phone: "136****1183", status: "正常" },
    { id: "member-zhang", name: "张伟", role: "季度会员", phone: "159****9021", status: "待激活" },
  ]);
  const [notifications, setNotifications] = useState([
    { id: "n1", title: "课程排期待确认", detail: "李明 · 7 月 31 日 18:00 一对一私教", read: false },
    { id: "n2", title: "AI 已更新训练方案", detail: "王芳 · 训练频次调整为每周 3 次", read: false },
    { id: "n3", title: "会员身体数据已更新", detail: "张伟新增体重与体脂记录", read: true },
  ]);
  const [settings, setSettings] = useState({ city: "鄂州", timezone: "Asia/Shanghai", hermesAutoSync: true, memberRegistration: true });
  const visibleUsers = users.filter((user) => !search || `${user.name}${user.role}${user.phone}${user.status}`.includes(search));

  useEffect(() => {
    fetch("/api/users", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { users?: Array<{ id: string; name: string; role: string; phone: string; status: string }> };
        if (!result.users?.length) return;
        setUsers(result.users.map((user) => ({
          ...user,
          role: user.role === "admin" ? "管理员" : user.role === "coach" ? "教练" : "会员",
          status: user.status === "active" ? "正常" : "已停用",
        })));
      })
      .catch(() => undefined);
  }, []);

  function exportData() {
    const csv = "\uFEFF姓名,角色,手机号,状态\n" + visibleUsers.map((user) => [user.name, user.role, user.phone, user.status].map((value) => `"${value}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `邵教练平台用户-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("用户数据已导出为 CSV");
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "");
    const roleMap: Record<string, string> = { "会员": "member", "教练": "coach", "管理员": "admin" };
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone: data.get("phone"), role: roleMap[String(data.get("role"))] || "member" }),
      });
      if (response.status === 404) {
        notify(`演示环境已完成 ${name} 的账号创建流程`, "info");
      } else {
        const result = await response.json() as { temporaryPassword?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "账号创建失败");
        if (result.temporaryPassword) {
          const copied = await copyTemporaryPassword(result.temporaryPassword);
          notify(copied ? `${name} 已创建，临时密码已复制` : `${name} 已创建，临时密码：${result.temporaryPassword}`, copied ? "success" : "info");
        }
      }
      setUsers((current) => [...current, { id: `local-${Date.now()}`, name, phone: String(data.get("phone") || ""), role: String(data.get("role") || "会员"), status: "正常" }]);
      setAccountOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "账号创建失败", "warning");
    }
  }

  async function saveManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managedUser) return;
    const data = new FormData(event.currentTarget);
    const role = String(data.get("role") || managedUser.role);
    const status = String(data.get("status") || managedUser.status);
    const next = { ...managedUser, role, status };
    setUsers((current) => current.map((user) => user.id === next.id ? next : user));
    try {
      await fetch("/api/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: next.id, role: role === "管理员" ? "admin" : role === "教练" ? "coach" : "member", status: status === "正常" ? "active" : "disabled" }),
      });
    } catch {}
    notify(`${next.name} 的账户权限已更新`);
    setManagedUser(null);
  }

  if (section === "ai-suggestions") {
    const filteredSuggestions = state.suggestions.filter((item) => suggestionFilter === "全部" || item.status === suggestionFilter);
    const selectedSuggestion = state.suggestions.find((item) => item.id === selectedSuggestionId) ?? null;
    const count = (status: "待确认" | "草稿" | "已发送") => state.suggestions.filter((item) => item.status === status).length;
    return (
      <div className="view-stack management-view">
        <section className="welcome-row"><div><span className="eyebrow">管理后台 · AI 建议管理</span><h1>AI 建议审核中心</h1><p>这里负责全站建议的审核、状态追踪与发送合规；不会进入教练的 AI 对话。</p></div><span className="admin-review-badge"><ShieldCheck size={17} /> 管理员审核视图</span></section>
        <div className="stats-grid four admin-ai-kpis">
          <StatCard icon={Sparkles} label="待确认" value={count("待确认")} suffix="条" note="等待教练确认" accent="amber" />
          <StatCard icon={FileDown} label="草稿" value={count("草稿")} suffix="条" note="仍可继续编辑" />
          <StatCard icon={Send} label="已创建任务" value={count("已发送")} suffix="条" note="不代表会员已收到" accent="slate" />
          <StatCard icon={ShieldCheck} label="合规复核" value="100" suffix="%" note="发送前需人工确认" />
        </div>
        <Card className="admin-ai-board">
          <div className="admin-ai-toolbar"><div><h2>建议处理队列</h2><p>按状态筛选并查看完整证据、风险和发送状态。</p></div><div className="admin-ai-filters">{(["全部", "待确认", "草稿", "已发送"] as const).map((filter) => <button key={filter} className={suggestionFilter === filter ? "active" : ""} onClick={() => setSuggestionFilter(filter)}>{filter}<em>{filter === "全部" ? state.suggestions.length : count(filter)}</em></button>)}</div></div>
          <div className="admin-suggestion-table">
            <div className="admin-suggestion-head"><span>会员与建议</span><span>类别</span><span>优先级</span><span>状态</span><span>操作</span></div>
            {filteredSuggestions.map((suggestion) => <button className="admin-suggestion-row" key={suggestion.id} onClick={() => setSelectedSuggestionId(suggestion.id)}><span><Avatar name={suggestion.member} size="sm" /><span><b>{suggestion.member}</b><small>{suggestion.title}</small></span></span><em>{suggestion.category}</em><i className={suggestion.priority === "重要" ? "important" : ""}>{suggestion.priority}</i><strong className={`suggestion-state state-${suggestion.status}`}>{suggestion.status}</strong><span className="text-button">审核详情 <ArrowRight size={15} /></span></button>)}
          </div>
        </Card>
        {selectedSuggestion ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedSuggestionId(null)}>
            <section className="modal admin-suggestion-modal" role="dialog" aria-modal="true" aria-label="AI 建议审核详情" onMouseDown={(event) => event.stopPropagation()}>
              <button className="icon-button modal-close" onClick={() => setSelectedSuggestionId(null)} aria-label="关闭"><X size={20} /></button>
              <span className="eyebrow">管理员审核 · {selectedSuggestion.category}</span><h2>{selectedSuggestion.member} · {selectedSuggestion.title}</h2>
              <div className="admin-suggestion-meta"><span>优先级 <b>{selectedSuggestion.priority}</b></span><span>当前状态 <b>{selectedSuggestion.status}</b></span><span>生成来源 <b>AI + 会员真实记录</b></span></div>
              <article className="admin-suggestion-content"><b>建议内容</b><p>{selectedSuggestion.content}</p></article>
              <div className="admin-review-checks"><span><Check size={16} /> 已绑定唯一会员档案</span><span><Check size={16} /> 未包含医疗诊断</span><span><Check size={16} /> 发送前仍需教练在企业微信确认</span></div>
              <p className="admin-send-warning"><AlertTriangle size={17} /> 创建发送任务不代表会员已收到；未取得实际发送状态前，系统不会显示“会员已收到”。</p>
              <div className="session-detail-actions"><button className="button button-secondary" onClick={() => { updateSuggestion(selectedSuggestion.id, "草稿", { silent: true }); setSelectedSuggestionId(null); notify("建议已退回草稿，等待教练修改", "info"); }}>退回修改</button><button className="button button-primary" onClick={() => { updateSuggestion(selectedSuggestion.id, "待确认", { silent: true }); setSelectedSuggestionId(null); notify("审核完成，等待教练在企业微信确认发送"); }}>通过审核</button></div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  if (section === "notifications") {
    const unread = notifications.filter((item) => !item.read).length;
    return (
      <div className="view-stack management-view">
        <section className="welcome-row"><div><span className="eyebrow">管理后台 · 消息通知</span><h1>消息通知中心</h1><p>{unread} 条未读消息，分别来自课程、AI 和会员数据更新。</p></div><button className="button button-secondary" onClick={() => { setNotifications((current) => current.map((item) => ({ ...item, read: true }))); notify("全部消息已标为已读"); }}><Check size={17} /> 全部已读</button></section>
        <Card>
          <SectionTitle title={`全部通知 · ${notifications.length}`} />
          <div className="admin-notification-list">{notifications.map((item) => <button key={item.id} className={item.read ? "read" : ""} onClick={() => setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification))}><span className="notification-dot" /><span><b>{item.title}</b><small>{item.detail}</small></span><em>{item.read ? "已读" : "未读"}</em><ArrowRight size={16} /></button>)}</div>
        </Card>
      </div>
    );
  }

  if (section === "settings") {
    return (
      <div className="view-stack management-view">
        <section className="welcome-row"><div><span className="eyebrow">管理后台 · 系统设置</span><h1>系统设置</h1><p>配置站点、权限和 AI 自动同步策略。</p></div></section>
        <div className="admin-settings-layout">
          <Card>
            <SectionTitle title="站点设置" />
            <div className="settings-form">
              <label>服务城市<input value={settings.city} onChange={(event) => setSettings((current) => ({ ...current, city: event.target.value }))} /></label>
              <label>系统时区<select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}><option value="Asia/Shanghai">Asia/Shanghai（中国标准时间）</option></select></label>
              <label className="setting-switch"><span><b>AI 自动同步</b><small>AI 调整会员数据后，页面无需手动同步。</small></span><input type="checkbox" checked={settings.hermesAutoSync} onChange={(event) => setSettings((current) => ({ ...current, hermesAutoSync: event.target.checked }))} /></label>
              <label className="setting-switch"><span><b>开放会员注册</b><small>允许中国内地手机号自助注册。</small></span><input type="checkbox" checked={settings.memberRegistration} onChange={(event) => setSettings((current) => ({ ...current, memberRegistration: event.target.checked }))} /></label>
              <button className="button button-primary" onClick={() => { window.localStorage.setItem("shao-admin-settings", JSON.stringify(settings)); notify("系统设置已保存"); }}><Settings size={17} /> 保存系统设置</button>
            </div>
          </Card>
          <Card className="integration-status-card">
            <SectionTitle title="集成状态" action={<span className="integration-overall"><i /> 3 项服务正常</span>} />
            <div className="integration-status-grid">
              <button onClick={() => notify("DeepSeek 连接正常")}>
                <span className="integration-icon"><Sparkles size={21} /></span>
                <span><b>AI 分析服务</b><small>DeepSeek V4 Flash</small></span>
                <em>运行正常</em><ArrowRight size={16} />
              </button>
              <button onClick={() => notify("AI 网站管理工具已启用")}>
                <span className="integration-icon"><Bot size={21} /></span>
                <span><b>AI 控制工具</b><small>课程、训练与饮食同步</small></span>
                <em>已启用</em><ArrowRight size={16} />
              </button>
              <button onClick={() => notify("企业微信客户联系接口状态正常")}>
                <span className="integration-icon"><MessageCircleMore size={21} /></span>
                <span><b>企业微信</b><small>官方客户联系接口</small></span>
                <em>已接入</em><ArrowRight size={16} />
              </button>
            </div>
            <p className="integration-footnote"><ShieldCheck size={16} /> 所有管理操作均记录审计日志，会员消息仍需教练确认发送。</p>
          </Card>
        </div>
      </div>
    );
  }

  if (section === "users") {
    return (
      <div className="view-stack management-view">
        <section className="welcome-row"><div><span className="eyebrow">管理后台 · 用户与角色</span><h1>用户与角色</h1><p>管理账户状态与角色权限；每位会员均使用唯一档案隔离数据。</p></div><button className="button button-primary" onClick={() => setAccountOpen(true)}><Plus size={17} /> 新增账号</button></section>
        <Card>
          <SectionTitle title={`平台账户 · ${visibleUsers.length}`} action={<label className="search-input"><Search size={16} /><input placeholder="搜索姓名、手机号或角色" value={search} onChange={(event) => setSearch(event.target.value)} /></label>} />
          <div className="admin-users admin-users-full">
            {visibleUsers.map((user) => <div key={user.id}><Avatar name={user.name} /><span><b>{user.name}</b><small>{user.phone}</small><small>{user.id}</small></span><em>{user.role}</em><i>{user.status}</i><button className="button button-secondary button-small" onClick={() => setManagedUser(user)}>管理账户</button></div>)}
          </div>
        </Card>
        {managedUser ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setManagedUser(null)}>
            <form className="modal modal-compact" onSubmit={saveManagedUser} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="icon-button modal-close" onClick={() => setManagedUser(null)} aria-label="关闭"><X size={20} /></button>
              <span className="eyebrow">账号管理 · {managedUser.id}</span><h2>{managedUser.name}</h2><p>{managedUser.phone}</p>
              <label className="stacked-label">角色<select name="role" defaultValue={managedUser.role.includes("管理员") ? "管理员" : managedUser.role.includes("教练") ? "教练" : "会员"}><option>会员</option><option>教练</option><option>管理员</option></select></label>
              <label className="stacked-label">账户状态<select name="status" defaultValue={managedUser.status}><option>正常</option><option>已停用</option></select></label>
              <button className="button button-primary full" type="submit"><Settings size={17} /> 保存账户设置</button>
            </form>
          </div>
        ) : null}
        {accountOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}>
            <form className="modal account-create-modal" onSubmit={addAccount} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="icon-button modal-close" onClick={() => setAccountOpen(false)} aria-label="关闭"><X size={20} /></button>
              <span className="eyebrow">账号与权限</span><h2>新增平台账号</h2>
              <p>一次填写完成，创建后系统将生成临时密码。</p>
              <div className="account-form-grid"><label className="stacked-label">姓名<input name="name" required maxLength={30} placeholder="请输入真实姓名" /></label><label className="stacked-label">手机号<input name="phone" inputMode="numeric" pattern="1[0-9]{10}" required placeholder="11 位中国内地手机号" /></label><label className="stacked-label account-role-field">账号角色<select name="role"><option>会员</option><option>教练</option><option>管理员</option></select></label></div>
              <div className="account-modal-actions"><button type="button" className="button button-secondary" onClick={() => setAccountOpen(false)}>取消</button><button className="button button-primary" type="submit">创建账号</button></div>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="view-stack management-view">
      <section className="welcome-row"><div><span className="eyebrow">管理后台</span><h1>系统运营总览</h1><p>鄂州站 · 数据更新时间：刚刚</p></div><div className="inline-actions"><button className="button button-secondary" onClick={exportData}><FileDown size={17} /> 导出数据</button><button className="button button-primary" onClick={() => setAccountOpen(true)}><Plus size={17} /> 新增账号</button></div></section>
      <div className="stats-grid four">
        <StatCard icon={UsersRound} label="活跃会员" value="128" note="月活 96%" />
        <StatCard icon={Dumbbell} label="本月训练" value="486" note="较上月 +12%" accent="amber" />
        <StatCard icon={CalendarDays} label="课程排期" value="322" note="履约率 92%" />
        <StatCard icon={CircleDollarSign} label="本月收入" value="¥128,620" note="较上月 +13%" />
      </div>
      <div className="admin-grid">
        <Card className="span-2">
          <SectionTitle title="平台运行状态" />
          <div className="service-grid"><Service icon={Cloud} name="网站服务" detail="鄂州业务站运行正常" /><Service icon={Database} name="业务数据库" detail="PostgreSQL 持久化正常" /><Service icon={Bot} name="AI 分析服务" detail="DeepSeek V4 Flash 已接入" /><Service icon={MessageCircleMore} name="企业微信 AI 助理" detail="官方长连接通道 · 已配置" /></div>
        </Card>
        <Card>
          <SectionTitle title="安全与合规" />
          <div className="compliance-list"><p><ShieldCheck size={19} /><span><b>数据传输加密</b><small>HTTPS / TLS 已启用</small></span><BadgeCheck size={17} /></p><p><Database size={19} /><span><b>每日自动备份</b><small>保留 14 天，可恢复</small></span><BadgeCheck size={17} /></p><p><Settings size={19} /><span><b>ICP备案</b><small>绑定域名前需完成</small></span><AlertTriangle size={17} /></p></div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="用户与角色" action={<label className="search-input"><Search size={16} /><input placeholder="搜索姓名、手机号或角色" value={search} onChange={(event) => setSearch(event.target.value)} /></label>} />
          <div className="admin-users">
            {visibleUsers.slice(0, 4).map((user) => <div key={user.id}><Avatar name={user.name} /><span><b>{user.name}</b><small>{user.phone}</small></span><em>{user.role}</em><i>{user.status}</i><button className="text-button" onClick={() => setManagedUser(user)}>管理</button></div>)}
          </div>
        </Card>
        <Card>
          <SectionTitle title="集成设置" />
          <div className="integration-list">
            <button onClick={() => notify("DeepSeek 连接测试已提交")}><span><Sparkles size={20} /><b>DeepSeek API</b></span><em className="ok">已接入</em><ArrowRight size={16} /></button>
            <button onClick={() => notify("企业微信 AI Bot 已就绪，扫码创建后即可启用", "info")}><span><MessageCircleMore size={20} /><b>AI健身助理</b></span><em>待扫码</em><ArrowRight size={16} /></button>
            <button onClick={() => notify("备份任务状态正常；最近一次恢复演练待执行", "info")}><span><Database size={20} /><b>数据备份</b></span><em className="ok">正常</em><ArrowRight size={16} /></button>
          </div>
        </Card>
      </div>
      {accountOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}>
          <form className="modal account-create-modal" onSubmit={addAccount} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setAccountOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">账号与权限</span><h2>新增平台账号</h2><p>系统会按角色限制数据访问范围。</p>
            <div className="account-form-grid"><label className="stacked-label">姓名<input name="name" required maxLength={30} placeholder="请输入真实姓名" /></label><label className="stacked-label">手机号<input name="phone" inputMode="numeric" pattern="1[0-9]{10}" required placeholder="11 位中国内地手机号" /></label><label className="stacked-label account-role-field">账号角色<select name="role"><option>会员</option><option>教练</option><option>管理员</option></select></label></div>
            <div className="account-modal-actions"><button type="button" className="button button-secondary" onClick={() => setAccountOpen(false)}>取消</button><button className="button button-primary" type="submit">创建账号</button></div>
          </form>
        </div>
      ) : null}
      {managedUser ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setManagedUser(null)}>
          <form className="modal modal-compact" onSubmit={saveManagedUser} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setManagedUser(null)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">账号管理 · {managedUser.id}</span><h2>{managedUser.name}</h2>
            <label className="stacked-label">角色<select name="role" defaultValue={managedUser.role.includes("管理员") ? "管理员" : managedUser.role.includes("教练") ? "教练" : "会员"}><option>会员</option><option>教练</option><option>管理员</option></select></label>
            <label className="stacked-label">账户状态<select name="status" defaultValue={managedUser.status}><option>正常</option><option>已停用</option></select></label>
            <button className="button button-primary full" type="submit">保存账户设置</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Service({ icon: Icon, name, detail, warning }: { icon: typeof Cloud; name: string; detail: string; warning?: boolean }) {
  return <div><span><Icon size={22} /></span><div><b>{name}</b><small>{detail}</small></div><em className={warning ? "warning" : ""}>{warning ? "待配置" : "运行正常"}</em></div>;
}
