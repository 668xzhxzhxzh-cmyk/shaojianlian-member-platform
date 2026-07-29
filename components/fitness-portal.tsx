"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Bell,
  Bot,
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Dumbbell,
  Home,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Scale,
  Settings,
  ShieldCheck,
  LockKeyhole,
  Smartphone,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { PortalView, Role } from "@/lib/portal-data";
import { formatShanghaiDate } from "@/lib/portal-data";
import { AssistantView } from "./assistant-view";
import {
  BenefitsView,
  BodyView,
  BookingView,
  CheckinsView,
  DashboardView,
  NutritionView,
  TrainingView,
} from "./member-views";
import { AdminView, CoachView } from "./management-views";
import { PortalProvider, usePortal } from "./portal-context";
import { Avatar } from "./ui";

const memberNav = [
  { view: "dashboard", label: "首页", icon: Home, href: "/" },
  { view: "training", label: "训练计划", icon: Dumbbell, href: "/training" },
  { view: "nutrition", label: "饮食管理", icon: Apple, href: "/nutrition" },
  { view: "checkins", label: "打卡记录", icon: CalendarCheck, href: "/checkins" },
  { view: "body", label: "身体数据", icon: Scale, href: "/body" },
  { view: "booking", label: "课程预约", icon: CalendarDays, href: "/booking" },
  { view: "assistant", label: "智能助理", icon: Sparkles, href: "/assistant" },
  { view: "benefits", label: "会员权益", icon: Trophy, href: "/benefits" },
] as const;

const coachNav = [
  { view: "coach", label: "工作台", icon: LayoutDashboard, href: "/coach" },
  { view: "coach", label: "会员管理", icon: UsersRound, href: "/coach" },
  { view: "training", label: "训练计划", icon: ClipboardCheck, href: "/training" },
  { view: "nutrition", label: "饮食方案", icon: Apple, href: "/nutrition" },
  { view: "body", label: "身体数据", icon: Activity, href: "/body" },
  { view: "assistant", label: "Hermes 助理", icon: Bot, href: "/assistant" },
] as const;

const adminNav = [
  { view: "admin", label: "系统总览", icon: LayoutDashboard, href: "/admin" },
  { view: "coach", label: "教练运营", icon: UsersRound, href: "/coach" },
  { view: "assistant", label: "AI 建议管理", icon: Sparkles, href: "/assistant" },
  { view: "booking", label: "课程排期", icon: CalendarDays, href: "/booking" },
  { view: "admin", label: "消息通知", icon: MessageCircleMore, href: "/admin" },
  { view: "admin", label: "系统设置", icon: Settings, href: "/admin" },
] as const;

export function FitnessPortal({ initialView }: { initialView: PortalView }) {
  return (
    <PortalProvider>
      <PortalShell initialView={initialView} />
    </PortalProvider>
  );
}

function PortalShell({ initialView }: { initialView: PortalView }) {
  const { state, loading, toasts } = usePortal();
  const initialRole: Role = initialView === "admin" ? "admin" : initialView === "coach" ? "coach" : "member";
  const [role, setRole] = useState<Role>(initialRole);
  const [view, setView] = useState<PortalView>(initialView);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "demo" | "authenticated" | "unauthorized">("checking");

  const navigation = role === "member" ? memberNav : role === "coach" ? coachNav : adminNav;
  const management = role !== "member";

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) {
          setAuthStatus("unauthorized");
          return;
        }
        if (response.status === 404) {
          setAuthStatus("demo");
          return;
        }
        if (!response.ok) {
          setAuthStatus("demo");
          return;
        }
        const result = await response.json() as { user?: { role?: Role } };
        const authenticatedRole = result.user?.role;
        if (authenticatedRole && ["member", "coach", "admin"].includes(authenticatedRole)) {
          setRole(authenticatedRole);
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("demo");
        }
      })
      .catch(() => setAuthStatus("demo"));
  }, []);

  useEffect(() => {
    function handlePopState() {
      const route = window.location.pathname.replace("/", "") || "dashboard";
      const known = [...memberNav, ...coachNav, ...adminNav].find((item) => item.href === `/${route}` || (route === "dashboard" && item.href === "/"));
      if (known) setView(known.view as PortalView);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (authStatus === "unauthorized") {
    return <LoginScreen onSuccess={(userRole) => {
      setRole(userRole);
      setAuthStatus("authenticated");
      if (userRole === "member") { setView("dashboard"); window.history.replaceState({}, "", "/"); }
      if (userRole === "coach") { setView("coach"); window.history.replaceState({}, "", "/coach"); }
      if (userRole === "admin") { setView("admin"); window.history.replaceState({}, "", "/admin"); }
    }} />;
  }

  function goTo(next: string, href?: string) {
    const nextView = next as PortalView;
    setView(nextView);
    if (nextView === "coach") setRole("coach");
    if (nextView === "admin") setRole("admin");
    const resolvedHref = href ?? [...memberNav, ...coachNav, ...adminNav].find((item) => item.view === nextView)?.href ?? "/";
    if (window.location.pathname !== resolvedHref) window.history.pushState({}, "", resolvedHref);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMobileOpen(false);
  }

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setProfileOpen(false);
    if (nextRole === "member") goTo("dashboard", "/");
    if (nextRole === "coach") goTo("coach", "/coach");
    if (nextRole === "admin") goTo("admin", "/admin");
  }

  const viewContent = useMemo(() => {
    switch (view) {
      case "training": return <TrainingView />;
      case "nutrition": return <NutritionView />;
      case "checkins": return <CheckinsView />;
      case "body": return <BodyView />;
      case "booking": return <BookingView />;
      case "assistant": return <AssistantView />;
      case "benefits": return <BenefitsView />;
      case "coach": return <CoachView openAssistant={() => goTo("assistant", "/assistant")} />;
      case "admin": return <AdminView />;
      default: return <DashboardView goTo={goTo} />;
    }
  }, [view]);

  return (
    <div className={`portal ${management ? "portal-management" : "portal-member"}`}>
      <header className="topbar">
        <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={21} /></button>
        <button className="brand" onClick={() => switchRole(role)}>
          <span className="brand-mark"><Activity size={24} /></span>
          <span><b>邵教练专属会员平台</b><small>{management ? role === "admin" ? "管理后台" : "智能教练工作台" : "让每一次进步都有记录"}</small></span>
        </button>
        {!management ? (
          <nav className="desktop-top-nav" aria-label="主导航">
            {memberNav.map(({ view: itemView, label, href }) => <a key={itemView} href={href} className={view === itemView ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href); }}>{label}</a>)}
          </nav>
        ) : null}
        <div className="topbar-actions">
          <button className="icon-button notification-button" aria-label="通知"><Bell size={20} /><i>5</i></button>
          <div className="profile-menu">
            <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}><Avatar name={role === "member" ? state.profile.name : "邵教练"} /><span><b>{role === "member" ? state.profile.name : "邵教练"}</b><small>{role === "member" ? "尊享会员" : role === "coach" ? "主教练" : "超级管理员"}</small></span><ChevronDown size={16} /></button>
            {profileOpen ? (
              <div className="profile-popover">
                <span className="eyebrow">切换演示角色</span>
                <button className={role === "member" ? "active" : ""} onClick={() => switchRole("member")}><UserRound size={17} /> 会员端{role === "member" ? <CheckCircle2 size={15} /> : null}</button>
                <button className={role === "coach" ? "active" : ""} onClick={() => switchRole("coach")}><Dumbbell size={17} /> 教练端{role === "coach" ? <CheckCircle2 size={15} /> : null}</button>
                <button className={role === "admin" ? "active" : ""} onClick={() => switchRole("admin")}><ShieldCheck size={17} /> 管理端{role === "admin" ? <CheckCircle2 size={15} /> : null}</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {management ? (
        <aside className="sidebar">
          <nav aria-label="管理导航">
            {navigation.map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-${index}`} href={href} className={view === itemView && (index === 0 || itemView !== navigation[index - 1]?.view) ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href); }}><Icon size={18} />{label}{label.includes("AI") ? <em>8</em> : null}</a>)}
          </nav>
          <div className="sidebar-profile"><Avatar name="邵教练" size="lg" /><div><b>邵教练</b><small>私人健身教练 · 武汉</small></div><button className="button button-primary full" onClick={() => switchRole("member")}>查看会员端</button></div>
        </aside>
      ) : null}

      <main className="portal-main">
        {loading ? <div className="sync-indicator"><span /> 正在同步会员数据</div> : null}
        {viewContent}
        <footer className="site-footer"><span>© 2026 邵教练专属会员平台 · 武汉</span><span>训练与营养建议不替代医疗诊断 · <a href="/privacy">隐私政策</a> · <a href="/terms">用户协议</a></span></footer>
      </main>

      <nav className="mobile-bottom-nav" aria-label="移动端导航">
        {navigation.slice(0, 5).map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-${index}`} href={href} className={view === itemView ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href); }}><Icon size={20} /><span>{label.length > 4 ? label.slice(0, 4) : label}</span></a>)}
        <button onClick={() => setMobileOpen(true)}><Menu size={20} /><span>更多</span></button>
      </nav>

      {mobileOpen ? (
        <div className="mobile-drawer-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <aside className="mobile-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row-between"><div className="brand"><span className="brand-mark"><Activity size={22} /></span><b>功能导航</b></div><button className="icon-button" onClick={() => setMobileOpen(false)} aria-label="关闭"><X size={20} /></button></div>
            <p>{formatShanghaiDate()}</p>
            <nav>{navigation.map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-drawer-${index}`} href={href} className={view === itemView ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href); }}><Icon size={19} />{label}</a>)}</nav>
            <div className="role-switch-mobile"><span>切换角色</span><button onClick={() => switchRole("member")} className={role === "member" ? "active" : ""}>会员</button><button onClick={() => switchRole("coach")} className={role === "coach" ? "active" : ""}>教练</button><button onClick={() => switchRole("admin")} className={role === "admin" ? "active" : ""}>管理</button></div>
          </aside>
        </div>
      ) : null}

      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id}><CheckCircle2 size={18} />{toast.message}</div>)}</div>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (role: Role) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: data.get("phone"), password: data.get("password") }),
      });
      const result = await response.json() as { user?: { role?: Role }; error?: string };
      if (!response.ok || !result.user?.role) throw new Error(result.error ?? "登录失败");
      onSuccess(result.user.role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="brand login-brand"><span className="brand-mark"><Activity size={25} /></span><span><b>邵教练专属会员平台</b><small>武汉 · 一对一科学训练</small></span></div>
        <div><span className="eyebrow light">专属训练 · 长期主义</span><h1>把每一次训练，变成看得见的进步。</h1><p>训练、饮食、恢复、预约与 Hermes 智能助理，都在一个安全的会员空间里。</p></div>
        <div className="login-trust"><span><ShieldCheck size={18} /> 分角色数据访问</span><span><LockKeyhole size={18} /> 全程 HTTPS 加密</span><span><Bot size={18} /> 教练确认后再推送</span></div>
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">会员登录</span><h2>欢迎回来</h2><p>使用邵教练为你开通的手机号与密码登录。</p>
          <label><span>手机号</span><div><Smartphone size={18} /><input name="phone" inputMode="numeric" autoComplete="username" placeholder="请输入 11 位手机号" pattern="1[0-9]{10}" required /></div></label>
          <label><span>密码</span><div><LockKeyhole size={18} /><input name="password" type="password" autoComplete="current-password" placeholder="请输入登录密码" minLength={8} required /></div></label>
          {error ? <div className="login-error">{error}</div> : null}
          <button className="button button-primary full" type="submit" disabled={busy}>{busy ? "正在安全登录…" : "登录平台"}</button>
          <small>首次登录或忘记密码，请联系邵教练重置。为保护隐私，请勿共享账号。</small>
        </form>
        <footer>© 2026 邵教练专属会员平台 · 武汉</footer>
      </section>
    </main>
  );
}
