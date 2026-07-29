"use client";

import {
  Activity,
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
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
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
import { memberRows } from "@/lib/portal-data";
import { usePortal } from "./portal-context";
import { Avatar, Card, ProgressBar, Ring, SectionTitle, StatCard } from "./ui";

const attendanceData = [
  { date: "6/29", value: 56 }, { date: "7/4", value: 74 }, { date: "7/9", value: 61 },
  { date: "7/14", value: 83 }, { date: "7/19", value: 64 }, { date: "7/24", value: 70 }, { date: "7/29", value: 82 },
];

export function CoachView({ openAssistant }: { openAssistant: () => void }) {
  const { state, updateSuggestion, notify } = usePortal();
  const pending = state.suggestions.filter((item) => item.status === "待确认");
  return (
    <div className="view-stack management-view">
      <section className="welcome-row"><div><span className="eyebrow">教练工作台</span><h1>上午好，邵教练</h1><p>今天有 15 次预约、8 条 AI 建议等待确认。</p></div><div className="inline-actions"><button className="button button-secondary"><RefreshCcw size={17} /> 同步数据</button><button className="button button-primary"><UserRoundPlus size={17} /> 新增会员</button></div></section>
      <div className="stats-grid five">
        <StatCard icon={UsersRound} label="会员总数" value="128" note="较昨日 +8" />
        <StatCard icon={UserRoundPlus} label="今日新增" value="2" note="较昨日 +1" accent="amber" />
        <StatCard icon={Dumbbell} label="今日训练" value="15" note="完成率 75%" />
        <StatCard icon={CalendarDays} label="本周预约" value="32" note="较上周 +6" accent="slate" />
        <StatCard icon={CircleDollarSign} label="本月收入" value="¥128,620" note="较上月 +13%" />
      </div>
      <div className="coach-dashboard-grid">
        <Card className="span-2">
          <SectionTitle title="会员健康状态" action={<div className="table-tools"><select><option>全部风险等级</option></select><label><Search size={15} /><input placeholder="搜索会员" /></label></div>} />
          <div className="member-table">
            <div className="table-row table-head"><span>会员</span><span>当前计划</span><span>最后打卡</span><span>恢复状态</span><span>出勤率</span><span>状态</span></div>
            {memberRows.map((member) => <button className="table-row" key={member.name}><span><Avatar name={member.name} size="sm" />{member.name}</span><span>{member.plan}</span><span>{member.last}</span><span><i className={`risk-dot risk-${member.risk}`} />{member.recovery}%</span><span>{member.attendance}%</span><em className={`risk-badge risk-${member.risk}`}>{member.risk}</em></button>)}
          </div>
          <button className="text-button centered">查看全部会员 <ArrowRight size={15} /></button>
        </Card>
        <Card>
          <SectionTitle title="今日预约" />
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
          <div className="task-groups"><Task icon={MessageCircleMore} label="未读会员消息" count={12} /><Task icon={Clock3} label="即将到期会员" count={5} /><Task icon={AlertTriangle} label="高风险健康预警" count={3} /></div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="训练计划执行率" action={<span className="pill">近 30 天</span>} />
          <ResponsiveContainer width="100%" height={230}><LineChart data={attendanceData} margin={{ top: 15, right: 15, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e7e4da" /><XAxis dataKey="date" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="value" stroke="#3f4d31" strokeWidth={2.5} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
          <div className="mini-kpis"><span>平均执行率 <b>78%</b></span><span>计划完成率 <b>72%</b></span><span>按时完成率 <b>68%</b></span></div>
        </Card>
        <Card>
          <SectionTitle title="打卡执行概览" />
          <div className="split-center"><Ring value={78} label="126" sublabel="总打卡" /><div className="legend-stack"><span><i className="green" />按时完成 98 人</span><span><i className="amber" />延迟完成 18 人</span><span><i className="red" />未完成 10 人</span></div></div>
        </Card>
      </div>
      <Card>
        <SectionTitle title={`AI 待确认建议 · ${pending.length}`} action={<button className="text-button" onClick={openAssistant}>进入 Hermes 工作台 <ArrowRight size={15} /></button>} />
        <div className="suggestion-strip">
          {state.suggestions.map((suggestion) => <article key={suggestion.id}><Avatar name={suggestion.member} /><div><b>{suggestion.member} · {suggestion.title}</b><p>{suggestion.content}</p><span>{suggestion.category} · {suggestion.priority}</span></div><div>{suggestion.status === "已发送" ? <em className="sent"><Check size={14} /> 已发送</em> : <><button className="button button-secondary button-small" onClick={openAssistant}>查看</button><button className="button button-primary button-small" onClick={() => { updateSuggestion(suggestion.id, "已发送"); notify("已进入 Hermes 推送队列"); }}><Send size={14} /> 确认</button></>}</div></article>)}
        </div>
      </Card>
    </div>
  );
}

function Task({ icon: Icon, label, count }: { icon: typeof MessageCircleMore; label: string; count: number }) {
  return <button><Icon size={20} /><span>{label}<small>{count} 项待处理</small></span><b>{count}</b><ArrowRight size={16} /></button>;
}

export function AdminView() {
  const { notify } = usePortal();
  return (
    <div className="view-stack management-view">
      <section className="welcome-row"><div><span className="eyebrow">管理后台</span><h1>系统运营总览</h1><p>武汉站 · 数据更新时间：刚刚</p></div><div className="inline-actions"><button className="button button-secondary"><FileDown size={17} /> 导出数据</button><button className="button button-primary"><Plus size={17} /> 新增账号</button></div></section>
      <div className="stats-grid five">
        <StatCard icon={UsersRound} label="活跃会员" value="128" note="月活 96%" />
        <StatCard icon={Dumbbell} label="本月训练" value="486" note="较上月 +12%" accent="amber" />
        <StatCard icon={CalendarDays} label="课程预约" value="322" note="履约率 92%" />
        <StatCard icon={Bot} label="Hermes 调用" value="1,286" note="成功率 99.4%" accent="slate" />
        <StatCard icon={CircleDollarSign} label="本月收入" value="¥128,620" note="较上月 +13%" />
      </div>
      <div className="admin-grid">
        <Card className="span-2">
          <SectionTitle title="平台运行状态" />
          <div className="service-grid"><Service icon={Cloud} name="网站服务" detail="武汉用户平均响应 82ms" /><Service icon={Database} name="业务数据库" detail="最近备份 12 分钟前" /><Service icon={Bot} name="DeepSeek / Hermes" detail="API 连接正常" /><Service icon={MessageCircleMore} name="企业微信推送" detail="待配置 Webhook 密钥" warning /></div>
        </Card>
        <Card>
          <SectionTitle title="安全与合规" />
          <div className="compliance-list"><p><ShieldCheck size={19} /><span><b>数据传输加密</b><small>HTTPS / TLS 已启用</small></span><BadgeCheck size={17} /></p><p><Database size={19} /><span><b>每日自动备份</b><small>保留 14 天，可恢复</small></span><BadgeCheck size={17} /></p><p><Settings size={19} /><span><b>ICP备案</b><small>绑定域名前需完成</small></span><AlertTriangle size={17} /></p></div>
        </Card>
        <Card className="span-2">
          <SectionTitle title="用户与角色" action={<label className="search-input"><Search size={16} /><input placeholder="搜索姓名、手机号或角色" /></label>} />
          <div className="admin-users">
            {[
              ["邵教练", "超级管理员 / 主教练", "138****6608", "正常"],
              ["李明", "尊享会员", "138****5206", "正常"],
              ["王芳", "年度会员", "136****1183", "正常"],
              ["张伟", "季度会员", "159****9021", "待激活"],
            ].map((user) => <div key={user[0]}><Avatar name={user[0]} /><span><b>{user[0]}</b><small>{user[2]}</small></span><em>{user[1]}</em><i>{user[3]}</i><button className="text-button">管理</button></div>)}
          </div>
        </Card>
        <Card>
          <SectionTitle title="集成设置" />
          <div className="integration-list">
            <button onClick={() => notify("DeepSeek 连接测试已提交")}><span><Sparkles size={20} /><b>DeepSeek API</b></span><em className="ok">已接入</em><ArrowRight size={16} /></button>
            <button onClick={() => notify("请在服务器环境变量中配置 WECOM_WEBHOOK_URL", "info")}><span><MessageCircleMore size={20} /><b>企业微信机器人</b></span><em>待配置</em><ArrowRight size={16} /></button>
            <button><span><Database size={20} /><b>数据备份</b></span><em className="ok">正常</em><ArrowRight size={16} /></button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Service({ icon: Icon, name, detail, warning }: { icon: typeof Cloud; name: string; detail: string; warning?: boolean }) {
  return <div><span><Icon size={22} /></span><div><b>{name}</b><small>{detail}</small></div><em className={warning ? "warning" : ""}>{warning ? "待配置" : "运行正常"}</em></div>;
}
