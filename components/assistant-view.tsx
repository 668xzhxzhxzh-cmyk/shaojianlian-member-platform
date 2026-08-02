"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  Bot,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Dumbbell,
  Edit3,
  FileText,
  History,
  MessageCircleMore,
  MoonStar,
  RefreshCcw,
  Send,
  ShieldAlert,
  Utensils,
  X,
} from "lucide-react";
import { memberRows } from "@/lib/portal-data";
import { portalFetch } from "@/lib/portal-auth";
import { redactConversationText } from "@/lib/public-conversation-text.mjs";
import { usePortal } from "./portal-context";
import { Avatar, Card, SectionTitle, TrendChart } from "./ui";

type ChatMessage = { role: "coach" | "assistant"; content: string; time: string };
type EvolutionReview = { review_date?: string; summary?: string; learned_rules?: string[] };

const quickPrompts = [
  "查看当前会员完整档案",
  "为当前会员增加一节私教课",
  "删除当前会员指定课程",
  "调整当前会员训练方案",
  "调整当前会员饮食方案",
  "新增本周身体反馈",
];

export function AssistantView({
  selectedMemberId,
  onSelectMember,
}: {
  selectedMemberId?: string;
  onSelectMember?: (memberId: string) => void;
}) {
  const { state, role, notify, updateSuggestion, refresh } = usePortal();
  const [localMemberId, setLocalMemberId] = useState(selectedMemberId ?? state.profile.id);
  const [memberOptions, setMemberOptions] = useState(memberRows);
  const activeMemberId = selectedMemberId ?? localMemberId;
  const selectedProfile = memberOptions.find((member) => member.id === activeMemberId) ?? {
    ...memberRows[0],
    id: state.profile.id,
    name: state.profile.name,
  };
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好，邵教练。我是 Hermes 执行型 AI 助理。请先从右侧选择会员，系统会安全锁定唯一档案。你可以直接让我增删或调整私教课程、更新会员档案、训练方案、饮食方案和身体反馈，执行结果会自动同步网站。", time: now() },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<"全部" | "训练" | "身体" | "打卡" | "沟通">("全部");
  const [saveState, setSaveState] = useState("");
  const [evolutionReview, setEvolutionReview] = useState<EvolutionReview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestion = state.suggestions[0];

  useEffect(() => {
    portalFetch("/api/users", role)
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { users?: Array<{ id: string; name: string; phone: string; role: string; status: string }> };
        const members = result.users?.filter((user) => Boolean(user.id) && user.role === "member" && user.status === "active") ?? [];
        if (!members.length) return;
        setMemberOptions(members.map((member, index) => ({
          ...memberRows[index % memberRows.length],
          id: member.id,
          name: member.name,
          phone: member.phone,
        })));
      })
      .catch(() => undefined);
  }, [role]);

  useEffect(() => {
    portalFetch("/api/hermes/evolution", role)
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { review?: EvolutionReview | null };
        if (result.review) setEvolutionReview(result.review);
      })
      .catch(() => undefined);
  }, [role]);

  const chartData = useMemo(
    () => state.bodyMetrics.slice(-7).map((item, index) => ({ ...item, load: [1820, 1940, 1600, 2250, 1760, 2140, 1680][index] })),
    [state.bodyMetrics],
  );

  async function askHermes(event?: FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const nextMessages = [...messages, { role: "coach" as const, content: message, time: now() }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 125_000);
    setMessages((items) => [...items, { role: "assistant", content: "", time: now() }]);
    try {
      const response = await portalFetch("/api/agent/chat", role, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          member_id: selectedProfile.id,
          messages: nextMessages.map((item) => ({
            role: item.role === "coach" ? "user" : "assistant",
            content: item.content,
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("AI 暂时没有返回内容");
      for await (const text of cumulativeText(response.body)) {
        setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: text } : item));
      }
      await refresh(selectedProfile.id);
      notify("AI 操作已完成，会员页面已自动同步");
    } catch (error) {
      const timedOut = (error as Error).name === "AbortError";
      setMessages((items) => items.map((item, index) => index === items.length - 1 ? {
        ...item,
        content: timedOut
          ? "Hermes 本次处理超时，任务未确认完成。请检查指令信息是否完整后重试。"
          : "Hermes 暂时未能完成本次任务，请稍后重试；其他业务功能不受影响。",
      } : item));
      notify(timedOut ? "Hermes 处理超时，未确认任务完成" : "Hermes 服务暂时不可用", "warning");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
      abortRef.current = null;
    }
  }

  function choosePrompt(prompt: string) {
    setInput(prompt);
    window.setTimeout(() => document.getElementById("hermes-input")?.focus(), 20);
  }

  function regenerate() {
    choosePrompt(`重新分析${selectedProfile.name}最近 7 天的训练、恢复和饮食数据，并生成一份更精炼的建议草稿。`);
    setSaveState("已准备重新生成，请检查指令后发送");
  }

  function confirmAndSend() {
    updateSuggestion(suggestion.id, "待确认", { silent: true });
    setSaveState("发送任务已创建，请在企业微信客户端确认发送。");
  }

  function chooseMember(memberId: string) {
    setLocalMemberId(memberId);
    onSelectMember?.(memberId);
    setMemberOpen(false);
    const member = memberOptions.find((item) => item.id === memberId);
    setSaveState(`当前会员已切换为 ${member?.name ?? "所选会员"}`);
  }

  return (
    <div className="assistant-page">
      <section className="page-intro assistant-intro">
        <span className="eyebrow">Hermes Agent · DeepSeek V4 Flash</span>
        <h1>Hermes 教练执行工作台</h1>
        <p>这里是教练专用的对话与执行入口。选择会员后系统会安全锁定唯一档案，再让 Hermes 实际增删课程、调整训练与饮食方案；管理端的“AI 建议管理”只负责审核，不是同一个页面。</p>
        <div className="assistant-scope-note"><Bot size={20} /><span><b>教练端：对话并执行会员任务</b><small>管理端：审核建议、权限与发送合规</small></span></div>
      </section>

      <div className="assistant-grid">
        <Card className="chat-panel">
          <div className="chat-heading"><div><MessageCircleMore size={20} /><b>与 Hermes 对话</b></div><button className={`icon-button ${historyOpen ? "active" : ""}`} onClick={() => setHistoryOpen((open) => !open)} aria-label="历史记录"><History size={18} /></button></div>
          {historyOpen ? <div className="chat-history"><b>最近对话</b><button onClick={() => { setHistoryOpen(false); notify("已打开今天 10:32 的恢复分析"); }}>今天 10:32 · 李明恢复分析</button><button onClick={() => { setHistoryOpen(false); notify("已打开 7 月 27 日的饮食复盘"); }}>7 月 27 日 · 饮食执行复盘</button></div> : null}
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.time}-${index}`}>
                <Avatar name={message.role === "coach" ? "邵教练" : "H"} size="sm" />
                <div><span>{message.role === "coach" ? "邵教练" : "AI 助理"} <time>{message.time}</time></span><p>{message.content ? redactConversationText(message.content, { memberIds: [selectedProfile.id] }) : <i className="typing">正在分析会员数据</i>}</p></div>
              </div>
            ))}
          </div>
          <div className="quick-prompts">
            <span>快捷指令</span>
            <div>{quickPrompts.map((prompt) => <button key={prompt} onClick={() => choosePrompt(prompt)}>{prompt}</button>)}</div>
          </div>
          <form className="chat-input" onSubmit={askHermes}>
            <textarea id="hermes-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入你希望 AI 分析的问题或任务…" rows={3} />
            <button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="发送给 AI">{busy ? <RefreshCcw className="spin" size={18} /> : <ArrowUp size={18} />}</button>
          </form>
          <small className="ai-disclaimer">AI 建议仅供教练决策参考，不能替代医疗诊断。</small>
        </Card>

        <div className="suggestion-column">
          <Card className="member-selector">
            <SectionTitle title="选择会员" />
            <button onClick={() => setMemberOpen((open) => !open)} aria-expanded={memberOpen}><Avatar name={selectedProfile.name} /><span><b>{selectedProfile.name} <em>VIP</em></b><small>{selectedProfile.goal} · 已绑定唯一会员档案</small></span><ChevronDown size={18} /></button>
            {memberOpen ? <div className="member-options">{memberOptions.slice(0, 8).map((member) => <button key={member.id} onClick={() => chooseMember(member.id)}><Avatar name={member.name} size="sm" />{member.name}<small>{member.goal} · {member.plan}</small></button>)}</div> : null}
            <div><span>本周训练<b>4 / 5 次</b></span><span>恢复评分<b>68 分</b></span><span>最近训练<b>7 月 28 日</b></span></div>
          </Card>
          <Card>
            <div className="suggestion-heading">
              <div><span className="eyebrow">AI 草稿 · 待邵教练确认</span><h2>为{selectedProfile.name}生成的个性化建议</h2></div>
              <div><button className="button button-secondary button-small" onClick={regenerate}><RefreshCcw size={15} /> 重新生成</button><button className="button button-secondary button-small" onClick={() => { updateSuggestion(suggestion.id, "草稿", { silent: true }); setSaveState("草稿已保存，可继续编辑"); }}><FileText size={15} /> 保存草稿</button></div>
            </div>
            <div className={`recommendation-list ${editing ? "is-editing" : ""}`}>
              <Recommendation icon={Dumbbell} title="训练调整" text="近 7 天肩部疲劳度偏高，建议下调上肢推举动作强度 10–15%，重点进行肩袖稳定与灵活性训练。" source="训练记录 · 身体数据" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={Utensils} title="饮食建议" text="优质蛋白日摄入建议维持 1.6–1.8 g/kg，增加深色蔬菜与抗炎食物，减少高糖高油饮品。" source="饮食记录 · 身体数据" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={MoonStar} title="恢复提醒" text="最近睡眠 6.2 小时，建议保证 7–8 小时睡眠；睡前进行 10 分钟呼吸与肩部放松。" source="身体数据 · 打卡记录" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={ShieldAlert} title="风险提示" text="肩部酸痛持续较多，若出现夜间痛或活动受限，应暂停相关负荷并及时咨询专业医务人员。" source="沟通记录 · 风险规则" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={ClipboardCheck} title="跟进任务" text="安排一次肩部放松与动作评估；下周训练前复测恢复评分，并根据结果调整计划。" source="沟通记录" editing={editing} onEdit={() => setEditing(true)} />
            </div>
            {saveState ? <div className="inline-save-state"><ClipboardCheck size={16} /> {saveState}</div> : null}
            <div className="suggestion-actions"><button className="button button-secondary" onClick={() => { setEditing((value) => !value); if (editing) { updateSuggestion(suggestion.id, "草稿", { silent: true }); setSaveState("修改已保存到草稿"); } }}><Edit3 size={17} /> {editing ? "完成修改" : "修改建议"}</button><button className="button button-primary" onClick={confirmAndSend}><Send size={17} /> 创建发送任务</button></div>
          </Card>
        </div>

        <div className="evidence-column">
          <Card>
            <SectionTitle title="会员证据概览" action={<button className="text-button" onClick={() => { setEvidenceTab("全部"); setEvidenceOpen(true); }}>查看全部</button>} />
            <div className="evidence-list"><Evidence icon={Dumbbell} label="训练记录" value="本周 4 / 5 次 · 负荷 1,820 kcal" onClick={() => { setEvidenceTab("训练"); setEvidenceOpen(true); }} /><Evidence icon={Activity} label="身体数据" value="体重 67.9 kg · 体脂 14.2%" onClick={() => { setEvidenceTab("身体"); setEvidenceOpen(true); }} /><Evidence icon={MoonStar} label="打卡记录" value="睡眠 6.2h · 恢复评分 68" onClick={() => { setEvidenceTab("打卡"); setEvidenceOpen(true); }} /><Evidence icon={MessageCircleMore} label="沟通记录" value="肩部酸痛（训练中出现）" onClick={() => { setEvidenceTab("沟通"); setEvidenceOpen(true); }} /></div>
          </Card>
          <Card>
            <SectionTitle title="趋势图表（近 7 天）" />
            <MiniTrend title="训练负荷（kcal）" data={chartData} dataKey="load" />
            <MiniTrend title="体重（kg）" data={chartData} dataKey="weight" />
            <MiniTrend title="体脂率（%）" data={chartData} dataKey="bodyFat" />
          </Card>
          <Card className="agent-status">
            <Bot size={24} /><div><b>AI 服务正常</b><span>DeepSeek 模型 · 鄂州服务区</span>{evolutionReview ? <small title={evolutionReview.summary}>每日复盘已开启 · {String(evolutionReview.review_date || "今日").slice(0, 10)} · {evolutionReview.learned_rules?.length ?? 0} 条规则</small> : <small>每日复盘已开启 · 等待首次运行</small>}</div><i />
          </Card>
        </div>
      </div>
      {evidenceOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEvidenceOpen(false)}>
          <section className="modal evidence-detail-modal" role="dialog" aria-modal="true" aria-label="会员证据详情" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button modal-close" onClick={() => setEvidenceOpen(false)} aria-label="关闭"><X size={20} /></button>
            <span className="eyebrow">AI 分析依据 · {selectedProfile.name}</span>
            <h2>会员证据中心</h2>
            <p>所有建议均可回溯到会员档案中的真实记录；系统使用唯一档案标识精确匹配，不根据昵称猜测。</p>
            <div className="evidence-tabs">{(["全部", "训练", "身体", "打卡", "沟通"] as const).map((tab) => <button key={tab} className={evidenceTab === tab ? "active" : ""} onClick={() => setEvidenceTab(tab)}>{tab}</button>)}</div>
            <div className="evidence-detail-list">
              {(evidenceTab === "全部" || evidenceTab === "训练") ? <EvidenceDetail icon={Dumbbell} title="训练执行" metric="4 / 5 次" detail="最近一次为下肢力量与髋稳定，完成度 86%，近七天训练负荷 1,820 kcal。" source="训练记录 · 7 月 29 日更新" /> : null}
              {(evidenceTab === "全部" || evidenceTab === "身体") ? <EvidenceDetail icon={Activity} title="身体趋势" metric="67.9 kg" detail="近三周体重下降 2.9 kg，体脂率 14.2%，下降节奏稳定。" source="身体数据 · 7 月 29 日更新" /> : null}
              {(evidenceTab === "全部" || evidenceTab === "打卡") ? <EvidenceDetail icon={CalendarDays} title="恢复与打卡" metric="68 分" detail="近三日平均睡眠 6.2 小时，恢复评分偏低，建议降低上肢推举负荷。" source="每日打卡 · 今天 08:18" /> : null}
              {(evidenceTab === "全部" || evidenceTab === "沟通") ? <EvidenceDetail icon={MessageCircleMore} title="沟通与风险" metric="需关注" detail="会员反馈肩部在训练中酸痛；若出现夜间痛或活动受限，应暂停相关训练并就医。" source="教练沟通记录 · 昨天 21:06" /> : null}
            </div>
            <div className="session-detail-actions"><button className="button button-secondary" onClick={() => setEvidenceOpen(false)}>返回工作台</button><button className="button button-primary" onClick={() => { setEvidenceOpen(false); choosePrompt(`根据${selectedProfile.name}当前训练、身体、打卡与沟通证据，重新生成可执行建议。`); }}>基于证据生成建议</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

async function* cumulativeText(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    yield text;
  }
}

function Recommendation({ icon: Icon, title, text, source, editing, onEdit }: { icon: typeof Dumbbell; title: string; text: string; source: string; editing: boolean; onEdit: () => void }) {
  return <article><span><Icon size={22} /></span><div><h3>{title}<em>可编辑</em></h3>{editing ? <textarea aria-label={`编辑${title}`} defaultValue={text} rows={3} /> : <p>{text}</p>}</div><small>数据来源：{source}</small><button className="text-button" onClick={onEdit}><Edit3 size={14} /> 编辑建议</button></article>;
}

function Evidence({ icon: Icon, label, value, onClick }: { icon: typeof Dumbbell; label: string; value: string; onClick: () => void }) {
  return <button type="button" onClick={onClick}><Icon size={19} /><span><b>{label}</b><small>{value}</small></span><ChevronDown size={15} /></button>;
}

function EvidenceDetail({ icon: Icon, title, metric, detail, source }: { icon: typeof Dumbbell; title: string; metric: string; detail: string; source: string }) {
  return <article><span><Icon size={20} /></span><div><div><b>{title}</b><em>{metric}</em></div><p>{detail}</p><small>{source}</small></div></article>;
}

function MiniTrend({ title, data, dataKey }: { title: string; data: Record<string, unknown>[]; dataKey: string }) {
  return (
    <div className="mini-trend"><div className="row-between"><b>{title}</b><small>平均趋势</small></div><TrendChart data={data} dataKey={dataKey} height={88} compact /></div>
  );
}

function now() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date());
}
