"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  Bot,
  Check,
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
} from "lucide-react";
import { usePortal } from "./portal-context";
import { Avatar, Card, SectionTitle, TrendChart } from "./ui";

type ChatMessage = { role: "coach" | "assistant"; content: string; time: string };

const quickPrompts = [
  "分析最近训练表现",
  "评估身体恢复变化",
  "给出饮食优化建议",
  "生成本周训练目标",
  "检查高风险会员",
  "安排睡眠恢复提醒",
];

export function AssistantView() {
  const { state, notify, updateSuggestion } = usePortal();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `你好，${state.profile.name}。我是 Hermes，可以结合你的训练、饮食、睡眠和身体记录提供个性化建议。你可以先告诉我当前训练目标。`, time: now() },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(state.profile.name);
  const [editing, setEditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const suggestion = state.suggestions[0];

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
    setMessages((items) => [...items, { role: "assistant", content: "", time: now() }]);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          member: state.profile,
          bodyMetrics: state.bodyMetrics.slice(-7),
          meals: state.meals,
          messages: nextMessages.map((item) => ({
            role: item.role === "coach" ? "user" : "assistant",
            content: item.content,
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("Hermes 暂时没有返回内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: text } : item));
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: "Hermes 当前处于演示模式。请在生产服务器启动原生 Hermes API 后即可获得实时个性化回答；其他业务功能不受影响。" } : item));
        notify("原生 Hermes 暂未连接，已切换演示回复", "warning");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function choosePrompt(prompt: string) {
    setInput(prompt);
    window.setTimeout(() => document.getElementById("hermes-input")?.focus(), 20);
  }

  function regenerate() {
    choosePrompt(`重新分析${selectedMember}最近 7 天的训练、恢复和饮食数据，并生成一份更精炼的建议草稿。`);
    notify("已准备重新生成指令，确认后发送给 Hermes", "info");
  }

  function confirmAndSend() {
    updateSuggestion(suggestion.id, "待确认");
    notify(`草稿已保存。请在企业微信“AI健身助理”中使用 member_id=${state.profile.id} 确认发送。`, "info");
  }

  return (
    <div className="assistant-page">
      <section className="page-intro assistant-intro">
        <span className="eyebrow">Hermes Agent · DeepSeek</span>
        <h1>智能助理工作台</h1>
        <p>让 Hermes 整理数据、生成建议，最终由教练确认后触达会员。</p>
      </section>
      <div className="assistant-flow" aria-label="建议工作流">
        <span className="done"><Check size={16} /> 沟通分析<small>明确目标</small></span>
        <i />
        <span className="done"><Check size={16} /> 生成建议<small>结合会员数据</small></span>
        <i />
        <span className="active">3 教练确认并发送<small>企业微信客户联系任务</small></span>
      </div>

      <div className="assistant-grid">
        <Card className="chat-panel">
          <div className="chat-heading"><div><MessageCircleMore size={20} /><b>与 Hermes 对话</b></div><button className={`icon-button ${historyOpen ? "active" : ""}`} onClick={() => setHistoryOpen((open) => !open)} aria-label="历史记录"><History size={18} /></button></div>
          {historyOpen ? <div className="chat-history"><b>最近对话</b><button onClick={() => { setHistoryOpen(false); notify("已打开今天 10:32 的恢复分析"); }}>今天 10:32 · 李明恢复分析</button><button onClick={() => { setHistoryOpen(false); notify("已打开 7 月 27 日的饮食复盘"); }}>7 月 27 日 · 饮食执行复盘</button></div> : null}
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.time}-${index}`}>
                <Avatar name={message.role === "coach" ? "邵教练" : "H"} size="sm" />
                <div><span>{message.role === "coach" ? "邵教练" : "Hermes"} <time>{message.time}</time></span><p>{message.content || <i className="typing">正在分析会员数据</i>}</p></div>
              </div>
            ))}
          </div>
          <div className="quick-prompts">
            <span>快捷指令</span>
            <div>{quickPrompts.map((prompt) => <button key={prompt} onClick={() => choosePrompt(prompt)}>{prompt}</button>)}</div>
          </div>
          <form className="chat-input" onSubmit={askHermes}>
            <textarea id="hermes-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入你希望 Hermes 分析的问题或任务…" rows={3} />
            <button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="发送给 Hermes">{busy ? <RefreshCcw className="spin" size={18} /> : <ArrowUp size={18} />}</button>
          </form>
          <small className="ai-disclaimer">AI 建议仅供教练决策参考，不能替代医疗诊断。</small>
        </Card>

        <div className="suggestion-column">
          <Card className="member-selector">
            <SectionTitle title="选择会员" />
            <button onClick={() => setMemberOpen((open) => !open)} aria-expanded={memberOpen}><Avatar name={selectedMember} /><span><b>{selectedMember} <em>VIP</em></b><small>28 岁 · 178cm / 72kg</small></span><ChevronDown size={18} /></button>
            {memberOpen ? <div className="member-options">{["李明", "王芳", "张伟"].map((member) => <button key={member} onClick={() => { setSelectedMember(member); setMemberOpen(false); notify(`已切换到会员 ${member}`); }}><Avatar name={member} size="sm" />{member}<small>{member === "李明" ? "减脂专项" : member === "王芳" ? "体态改善" : "增肌专项"}</small></button>)}</div> : null}
            <div><span>本周训练<b>4 / 5 次</b></span><span>恢复评分<b>68 分</b></span><span>最近训练<b>7 月 28 日</b></span></div>
          </Card>
          <Card>
            <div className="suggestion-heading">
              <div><span className="eyebrow">AI 草稿 · 待邵教练确认</span><h2>为{selectedMember}生成的个性化建议</h2></div>
              <div><button className="button button-secondary button-small" onClick={regenerate}><RefreshCcw size={15} /> 重新生成</button><button className="button button-secondary button-small" onClick={() => updateSuggestion(suggestion.id, "草稿")}><FileText size={15} /> 保存草稿</button></div>
            </div>
            <div className={`recommendation-list ${editing ? "is-editing" : ""}`}>
              <Recommendation icon={Dumbbell} title="训练调整" text="近 7 天肩部疲劳度偏高，建议下调上肢推举动作强度 10–15%，重点进行肩袖稳定与灵活性训练。" source="训练记录 · 身体数据" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={Utensils} title="饮食建议" text="优质蛋白日摄入建议维持 1.6–1.8 g/kg，增加深色蔬菜与抗炎食物，减少高糖高油饮品。" source="饮食记录 · 身体数据" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={MoonStar} title="恢复提醒" text="最近睡眠 6.2 小时，建议保证 7–8 小时睡眠；睡前进行 10 分钟呼吸与肩部放松。" source="身体数据 · 打卡记录" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={ShieldAlert} title="风险提示" text="肩部酸痛持续较多，若出现夜间痛或活动受限，应暂停相关负荷并及时咨询专业医务人员。" source="沟通记录 · 风险规则" editing={editing} onEdit={() => setEditing(true)} />
              <Recommendation icon={ClipboardCheck} title="跟进任务" text="安排一次肩部放松与动作评估；下周训练前复测恢复评分，并根据结果调整计划。" source="沟通记录" editing={editing} onEdit={() => setEditing(true)} />
            </div>
            <div className="suggestion-actions"><button className="button button-secondary" onClick={() => { setEditing((value) => !value); if (editing) notify("修改已保存到草稿"); }}><Edit3 size={17} /> {editing ? "完成修改" : "修改建议"}</button><button className="button button-primary" onClick={confirmAndSend}><Send size={17} /> 保存并前往企业微信确认</button></div>
          </Card>
        </div>

        <div className="evidence-column">
          <Card>
            <SectionTitle title="会员证据概览" action={<button className="text-button" onClick={() => notify("已汇总训练、身体、打卡和沟通四类证据", "info")}>查看全部</button>} />
            <div className="evidence-list"><Evidence icon={Dumbbell} label="训练记录" value="本周 4 / 5 次 · 负荷 1,820 kcal" /><Evidence icon={Activity} label="身体数据" value="体重 67.9 kg · 体脂 14.2%" /><Evidence icon={MoonStar} label="打卡记录" value="睡眠 6.2h · 恢复评分 68" /><Evidence icon={MessageCircleMore} label="沟通记录" value="肩部酸痛（训练中出现）" /></div>
          </Card>
          <Card>
            <SectionTitle title="趋势图表（近 7 天）" />
            <MiniTrend title="训练负荷（kcal）" data={chartData} dataKey="load" />
            <MiniTrend title="体重（kg）" data={chartData} dataKey="weight" />
            <MiniTrend title="体脂率（%）" data={chartData} dataKey="bodyFat" />
          </Card>
          <Card className="agent-status">
            <Bot size={24} /><div><b>Hermes 服务正常</b><span>DeepSeek 模型 · 武汉时区</span></div><i />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Recommendation({ icon: Icon, title, text, source, editing, onEdit }: { icon: typeof Dumbbell; title: string; text: string; source: string; editing: boolean; onEdit: () => void }) {
  return <article><span><Icon size={22} /></span><div><h3>{title}<em>可编辑</em></h3>{editing ? <textarea aria-label={`编辑${title}`} defaultValue={text} rows={3} /> : <p>{text}</p>}</div><small>数据来源：{source}</small><button className="text-button" onClick={onEdit}><Edit3 size={14} /> 编辑建议</button></article>;
}

function Evidence({ icon: Icon, label, value }: { icon: typeof Dumbbell; label: string; value: string }) {
  return <div><Icon size={19} /><span><b>{label}</b><small>{value}</small></span></div>;
}

function MiniTrend({ title, data, dataKey }: { title: string; data: Record<string, unknown>[]; dataKey: string }) {
  return (
    <div className="mini-trend"><div className="row-between"><b>{title}</b><small>平均趋势</small></div><TrendChart data={data} dataKey={dataKey} height={88} compact /></div>
  );
}

function now() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date());
}
