"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Apple,
  Bell,
  Bot,
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
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
  LogOut,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { PortalView, Role } from "@/lib/portal-data";
import { formatShanghaiDate } from "@/lib/portal-data";
import { AssistantView } from "./assistant-view";
import { CoachWorkspace, type CoachSection } from "./coach-workspace";
import {
  BenefitsView,
  BodyView,
  CheckinsView,
  DashboardView,
  NutritionView,
  TrainingView,
} from "./member-views";
import { AdminView } from "./management-views";
import { PortalProvider, usePortal } from "./portal-context";
import { Avatar } from "./ui";

const memberNav = [
  { view: "dashboard", label: "首页", icon: Home, href: "/" },
  { view: "training", label: "训练计划", icon: Dumbbell, href: "/training" },
  { view: "nutrition", label: "饮食管理", icon: Apple, href: "/nutrition" },
  { view: "checkins", label: "打卡记录", icon: CalendarCheck, href: "/checkins" },
  { view: "body", label: "身体数据", icon: Scale, href: "/body" },
  { view: "benefits", label: "会员权益", icon: Trophy, href: "/benefits" },
] as const;

const coachNav = [
  { view: "coach", label: "工作台", icon: LayoutDashboard, href: "/coach" },
  { view: "coach-members", label: "会员管理", icon: UsersRound, href: "/coach/members" },
  { view: "coach-schedule", label: "课程排期", icon: CalendarDays, href: "/coach/schedule" },
  { view: "coach-training", label: "训练方案", icon: Dumbbell, href: "/coach/training" },
  { view: "coach-nutrition", label: "饮食方案", icon: Apple, href: "/coach/nutrition" },
  { view: "coach-body", label: "身体反馈", icon: Activity, href: "/coach/body" },
  { view: "assistant", label: "Hermes AI 助理", icon: Bot, href: "/assistant" },
] as const;

const adminNav = [
  { view: "admin", label: "系统总览", icon: LayoutDashboard, href: "/admin" },
  { view: "admin-ai", label: "AI 建议管理", icon: Sparkles, href: "/admin/ai-suggestions" },
  { view: "admin-notifications", label: "消息通知", icon: MessageCircleMore, href: "/admin/notifications" },
  { view: "admin-users", label: "用户与角色", icon: UserRound, href: "/admin/users" },
  { view: "admin-settings", label: "系统设置", icon: Settings, href: "/admin/settings" },
] as const;

export function FitnessPortal({ initialView }: { initialView: PortalView }) {
  return (
    <PortalProvider>
      <PortalShell initialView={initialView} />
    </PortalProvider>
  );
}

function PortalShell({ initialView }: { initialView: PortalView }) {
  const { state, loading, toasts, refresh, notify } = usePortal();
  const initialRole: Role = initialView.startsWith("admin") ? "admin" : initialView.startsWith("coach") || initialView === "assistant" ? "coach" : "member";
  const [role, setRole] = useState<Role>(initialRole);
  const [authorizedRole, setAuthorizedRole] = useState<Role | null>(null);
  const [view, setView] = useState<PortalView>(initialView);
  const [activeNavLabel, setActiveNavLabel] = useState<string>(
    initialView.startsWith("admin")
      ? adminNav.find((item) => item.view === initialView)?.label ?? "系统总览"
      : initialView === "assistant"
        ? "Hermes AI 助理"
        : coachNav.find((item) => item.view === initialView)?.label
          ?? memberNav.find((item) => item.view === initialView)?.label
          ?? "首页",
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCoachMember, setSelectedCoachMember] = useState("member-li");
  const [authStatus, setAuthStatus] = useState<"checking" | "demo" | "authenticated" | "unauthorized">("checking");

  const navigation = role === "member" ? memberNav : role === "coach" ? coachNav : adminNav;
  const management = role !== "member";
  const accountName = role === "member" ? state.profile.name : role === "coach" ? "邵教练" : "系统管理员";
  const accountSubtitle = role === "member" ? "尊享会员" : role === "coach" ? "主教练" : "平台管理员";
  const sidebarSubtitle = role === "coach" ? "私人健身教练 · 鄂州" : "独立管理账户 · 权限审计";
  const pendingAiCount = state.suggestions.filter((item) => item.status === "待确认").length;
  const notificationItems = role === "admin" ? [
    { id: "admin-system", icon: ShieldCheck, title: "系统通知待处理", detail: "查看平台安全与业务通知", time: "刚刚", view: "admin-notifications", href: "/admin/notifications", label: "消息通知" },
    { id: "admin-ai", icon: Sparkles, title: "AI 建议等待审核", detail: `${pendingAiCount} 条建议需要合规复核`, time: "8 分钟", view: "admin-ai", href: "/admin/ai-suggestions", label: "AI 建议管理" },
    { id: "admin-user", icon: UsersRound, title: "新增会员账号", detail: "新注册会员等待角色确认", time: "今天", view: "admin-users", href: "/admin/users", label: "用户与角色" },
    { id: "admin-audit", icon: Activity, title: "会员数据变更记录", detail: "训练方案与课程记录有新变更", time: "今天", view: "admin-notifications", href: "/admin/notifications", label: "消息通知" },
    { id: "admin-config", icon: Settings, title: "系统配置检查完成", detail: "网站、数据库和 Hermes 服务运行正常", time: "昨天", view: "admin-settings", href: "/admin/settings", label: "系统设置" },
  ] : role === "coach" ? [
    { id: "coach-schedule", icon: CalendarDays, title: "私教排期待确认", detail: "明天 14:00 一对一私教", time: "刚刚", view: "coach-schedule", href: "/coach/schedule", label: "课程排期" },
    { id: "coach-hermes", icon: Bot, title: "Hermes 可执行会员任务", detail: "可增删课程并调整训练、饮食方案", time: "8 分钟", view: "assistant", href: "/assistant", label: "Hermes AI 助理" },
    { id: "coach-body", icon: Activity, title: "会员身体数据已更新", detail: "李明最新体重 67.9 kg", time: "今天", view: "coach-body", href: "/coach/body", label: "身体反馈" },
    { id: "coach-nutrition", icon: Apple, title: "饮食执行需要跟进", detail: "两位会员今日饮食记录未完成", time: "今天", view: "coach-nutrition", href: "/coach/nutrition", label: "饮食方案" },
    { id: "coach-member", icon: UsersRound, title: "会员计划即将到期", detail: "一位会员计划将在 7 天内到期", time: "昨天", view: "coach-members", href: "/coach/members", label: "会员管理" },
  ] : [
    { id: "member-schedule", icon: CalendarDays, title: "私教安排已更新", detail: "明天 14:00 一对一私教", time: "刚刚", view: "dashboard", href: "/", label: "首页" },
    { id: "member-nutrition", icon: Apple, title: "今日饮食待记录", detail: "晚餐与饮水目标尚未完成", time: "8 分钟", view: "nutrition", href: "/nutrition", label: "饮食管理" },
    { id: "member-body", icon: Activity, title: "身体数据已更新", detail: "最新体重 67.9 kg", time: "今天", view: "body", href: "/body", label: "身体数据" },
    { id: "member-checkin", icon: CalendarCheck, title: "连续打卡提醒", detail: "完成今日记录可保持连续打卡", time: "今天", view: "checkins", href: "/checkins", label: "打卡记录" },
    { id: "member-benefits", icon: Trophy, title: "会员权益提醒", detail: "本月体态评估权益尚未使用", time: "昨天", view: "benefits", href: "/benefits", label: "会员权益" },
  ];
  const unreadNotificationCount = notificationItems.filter((item) => !readNotificationIds.includes(item.id)).length;

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
          setAuthorizedRole(authenticatedRole);
          if (authenticatedRole === "member") {
            const memberPathAllowed = memberNav.some((item) => item.href === window.location.pathname);
            setView((current) => current.startsWith("coach") || current.startsWith("admin") || current === "assistant" ? "dashboard" : current);
            setActiveNavLabel(memberPathAllowed ? memberNav.find((item) => item.href === window.location.pathname)?.label ?? "首页" : "首页");
            if (window.location.pathname.startsWith("/coach") || ["/admin", "/assistant"].includes(window.location.pathname)) window.history.replaceState({}, "", "/");
          }
          if (authenticatedRole === "coach") {
            const currentCoachItem = coachNav.find((item) => item.href === window.location.pathname);
            const nextCoachView = currentCoachItem?.view ?? (window.location.pathname === "/assistant" ? "assistant" : "coach");
            setView(nextCoachView);
            setActiveNavLabel(currentCoachItem?.label ?? (nextCoachView === "assistant" ? "Hermes AI 助理" : "工作台"));
            if (!window.location.pathname.startsWith("/coach") && window.location.pathname !== "/assistant") window.history.replaceState({}, "", "/coach");
          }
          if (authenticatedRole === "admin") {
            const currentAdminItem = adminNav.find((item) => item.href === window.location.pathname);
            const nextAdminView = currentAdminItem?.view ?? "admin";
            setView(nextAdminView);
            setActiveNavLabel(currentAdminItem?.label ?? "系统总览");
            if (!currentAdminItem) window.history.replaceState({}, "", "/admin");
          }
          setAuthStatus("authenticated");
          void refresh();
        } else {
          setAuthStatus("demo");
        }
      })
      .catch(() => setAuthStatus("demo"));
  }, [refresh]);

  useEffect(() => {
    function handlePopState() {
      const route = window.location.pathname.replace("/", "") || "dashboard";
      const known = [...memberNav, ...coachNav, ...adminNav].find((item) => item.href === `/${route}` || (route === "dashboard" && item.href === "/"));
      if (known) {
        setView(known.view as PortalView);
        setActiveNavLabel(known.label);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (authStatus === "unauthorized") {
    return <LoginScreen requestedRole={initialRole} onSuccess={(userRole) => {
      setRole(userRole);
      setAuthorizedRole(userRole);
      setAuthStatus("authenticated");
      void refresh();
      if (userRole === "member") { setView("dashboard"); setActiveNavLabel("首页"); window.history.replaceState({}, "", "/"); }
      if (userRole === "coach") { setView("coach"); setActiveNavLabel("工作台"); window.history.replaceState({}, "", "/coach"); }
      if (userRole === "admin") { setView("admin"); setActiveNavLabel("系统总览"); window.history.replaceState({}, "", "/admin"); }
    }} />;
  }

  function goTo(next: string, href?: string, label?: string) {
    const nextView = next as PortalView;
    if (role === "member" && (nextView === "assistant" || nextView.startsWith("coach") || nextView.startsWith("admin"))) {
      notify("该功能仅供教练使用", "warning");
      return;
    }
    if (authStatus === "authenticated" && role === "coach" && nextView.startsWith("admin")) {
      notify("教练账号不能进入管理端", "warning");
      return;
    }
    if (authStatus === "authenticated" && role === "admin" && (nextView.startsWith("coach") || nextView === "assistant")) {
      notify("管理员账号不能进入教练工作台", "warning");
      return;
    }
    const resolvedLabel = label ?? navigation.find((item) => item.view === nextView)?.label ?? memberNav.find((item) => item.view === nextView)?.label;
    if (resolvedLabel) setActiveNavLabel(resolvedLabel);
    setView(nextView);
    if (authStatus === "demo" && nextView === "coach") setRole("coach");
    if (authStatus === "demo" && nextView === "admin") setRole("admin");
    const resolvedHref = href ?? [...memberNav, ...coachNav, ...adminNav].find((item) => item.view === nextView)?.href ?? "/";
    if (window.location.pathname !== resolvedHref) window.history.pushState({}, "", resolvedHref);
    window.scrollTo(0, 0);
    setMobileOpen(false);
  }

  function switchRole(nextRole: Role) {
    if (authStatus === "authenticated" && authorizedRole !== nextRole) {
      notify("当前账号没有该角色权限", "warning");
      return;
    }
    setRole(nextRole);
    setProfileOpen(false);
    if (nextRole === "member") goTo("dashboard", "/", "首页");
    if (nextRole === "coach") goTo("coach", "/coach", "工作台");
    if (nextRole === "admin") goTo("admin", "/admin", "系统总览");
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setProfileOpen(false);
      setAuthorizedRole(null);
      setAuthStatus("unauthorized");
      const loginPath = role === "admin" ? "/admin/login" : role === "coach" ? "/coach/login" : "/";
      window.history.replaceState({}, "", loginPath);
    }
  }

  function selectCoachMember(memberId: string) {
    setSelectedCoachMember(memberId);
    void refresh(memberId);
  }

  const viewContent = (() => {
    switch (view) {
      case "training": return <TrainingView />;
      case "nutrition": return <NutritionView />;
      case "checkins": return <CheckinsView />;
      case "body": return <BodyView />;
      case "assistant": return role === "member" ? <DashboardView goTo={goTo} /> : <AssistantView selectedMemberId={selectedCoachMember} onSelectMember={selectCoachMember} />;
      case "benefits": return <BenefitsView />;
      case "coach":
      case "coach-members":
      case "coach-schedule":
      case "coach-training":
      case "coach-nutrition":
      case "coach-body": {
        const coachSectionMap: Record<string, CoachSection> = {
          coach: "overview",
          "coach-members": "members",
          "coach-schedule": "schedule",
          "coach-training": "training",
          "coach-nutrition": "nutrition",
          "coach-body": "body",
        };
        return <CoachWorkspace section={coachSectionMap[view] ?? "overview"} selectedMemberId={selectedCoachMember} onSelectMember={selectCoachMember} goTo={goTo} openAssistant={() => goTo("assistant", "/assistant", "Hermes AI 助理")} />;
      }
      case "admin": return <AdminView section="overview" />;
      case "admin-ai": return <AdminView section="ai-suggestions" />;
      case "admin-notifications": return <AdminView section="notifications" />;
      case "admin-users": return <AdminView section="users" />;
      case "admin-settings": return <AdminView section="settings" />;
      default: return <DashboardView goTo={goTo} />;
    }
  })();

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
            {memberNav.map(({ view: itemView, label, href }) => <a key={itemView} href={href} className={activeNavLabel === label ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href, label); }}>{label}</a>)}
          </nav>
        ) : null}
        <div className="topbar-actions">
          <div className="notification-menu">
            <button className={`icon-button notification-button ${notificationOpen ? "active" : ""}`} onClick={() => { setNotificationOpen((open) => !open); setProfileOpen(false); }} aria-label={`通知，${unreadNotificationCount} 条未读`} aria-expanded={notificationOpen}><Bell size={20} />{unreadNotificationCount ? <i>{unreadNotificationCount}</i> : null}</button>
            {notificationOpen ? <div className="notification-popover">
              <div className="row-between"><span><b>消息通知</b><small>共 5 条 · {unreadNotificationCount} 条未读</small></span><button className="text-button" onClick={() => { setReadNotificationIds(notificationItems.map((item) => item.id)); notify("5 条通知已全部标为已读"); }}>全部已读</button></div>
              <div className="notification-popover-list" tabIndex={0} aria-label="通知列表，可上下滚动">
                {notificationItems.map(({ id, icon: Icon, title, detail, time, view: nextView, href, label }) => <button className={readNotificationIds.includes(id) ? "is-read" : ""} key={id} onClick={() => { setReadNotificationIds((current) => current.includes(id) ? current : [...current, id]); setNotificationOpen(false); goTo(nextView, href, label); }}><Icon size={18} /><span><b>{title}</b><small>{detail}</small></span><em>{time}</em></button>)}
              </div>
            </div> : null}
          </div>
          <div className="profile-menu">
            <button className="profile-trigger" onClick={() => { setProfileOpen((open) => !open); setNotificationOpen(false); }} aria-expanded={profileOpen}><Avatar name={accountName} /><span><b>{accountName}</b><small>{accountSubtitle}</small></span><ChevronDown size={16} /></button>
            {profileOpen ? (
              <div className="profile-popover">
                <span className="eyebrow">{authStatus === "demo" ? "切换演示角色" : "当前账号"}</span>
                {(authStatus === "demo" || authorizedRole === "member") ? <button className={role === "member" ? "active" : ""} onClick={() => switchRole("member")}><UserRound size={17} /> 会员端{role === "member" ? <CheckCircle2 size={15} /> : null}</button> : null}
                {(authStatus === "demo" || authorizedRole === "coach") ? <button className={role === "coach" ? "active" : ""} onClick={() => switchRole("coach")}><Dumbbell size={17} /> 教练端{role === "coach" ? <CheckCircle2 size={15} /> : null}</button> : null}
                {(authStatus === "demo" || authorizedRole === "admin") ? <button className={role === "admin" ? "active" : ""} onClick={() => switchRole("admin")}><ShieldCheck size={17} /> 管理端{role === "admin" ? <CheckCircle2 size={15} /> : null}</button> : null}
                {authStatus === "authenticated" ? <button className="logout-button" onClick={logout}><LogOut size={17} /> 退出登录</button> : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {management ? (
        <aside className="sidebar">
          <nav aria-label="管理导航">
            {navigation.map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-${index}`} href={href} className={activeNavLabel === label ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href, label); }}><Icon size={18} />{label}{role === "admin" && itemView === "admin-ai" && pendingAiCount ? <em title={`${pendingAiCount} 条 AI 建议等待管理员审核`} aria-label={`${pendingAiCount} 条待审核 AI 建议`}>{pendingAiCount}</em> : null}</a>)}
          </nav>
          <div className="sidebar-profile"><Avatar name={accountName} size="lg" /><div><b>{accountName}</b><small>{sidebarSubtitle}</small></div>{role === "coach" ? <button className="button button-primary full" onClick={() => goTo("assistant", "/assistant", "Hermes AI 助理")}>Hermes 工作台</button> : null}</div>
        </aside>
      ) : null}

      <main className="portal-main">
        {loading ? <div className="sync-indicator"><span /> 正在同步会员数据</div> : null}
        {viewContent}
        <footer className="site-footer"><span>© 2026 邵教练专属会员平台 · 鄂州</span><span>训练与营养建议不替代医疗诊断 · <a href="/privacy">隐私政策</a> · <a href="/terms">用户协议</a></span></footer>
      </main>

      <nav className="mobile-bottom-nav" aria-label="移动端导航">
        {navigation.slice(0, 5).map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-${index}`} href={href} className={activeNavLabel === label ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href, label); }}><Icon size={20} /><span>{label.length > 4 ? label.slice(0, 4) : label}</span></a>)}
        <button onClick={() => setMobileOpen(true)}><Menu size={20} /><span>更多</span></button>
      </nav>

      {mobileOpen ? (
        <div className="mobile-drawer-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <aside className="mobile-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row-between"><div className="brand"><span className="brand-mark"><Activity size={22} /></span><b>功能导航</b></div><button className="icon-button" onClick={() => setMobileOpen(false)} aria-label="关闭"><X size={20} /></button></div>
            <p>{formatShanghaiDate()}</p>
            <nav>{navigation.map(({ view: itemView, label, icon: Icon, href }, index) => <a key={`${label}-drawer-${index}`} href={href} className={activeNavLabel === label ? "active" : ""} onClick={(event) => { event.preventDefault(); goTo(itemView, href, label); }}><Icon size={19} />{label}</a>)}</nav>
            {authStatus === "demo" ? <div className="role-switch-mobile"><span>切换演示角色</span><button onClick={() => switchRole("member")} className={role === "member" ? "active" : ""}>会员</button><button onClick={() => switchRole("coach")} className={role === "coach" ? "active" : ""}>教练</button><button onClick={() => switchRole("admin")} className={role === "admin" ? "active" : ""}>管理</button></div> : null}
          </aside>
        </div>
      ) : null}

      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id}><CheckCircle2 size={18} />{toast.message}</div>)}</div>
    </div>
  );
}

function LoginScreen({ requestedRole, onSuccess }: { requestedRole: Role; onSuccess: (role: Role) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const managementLogin = requestedRole !== "member";
  const registering = !managementLogin && mode === "register";
  const adminLogin = requestedRole === "admin";
  const coachLogin = requestedRole === "coach";
  const roleLabel = adminLogin ? "管理员" : coachLogin ? "教练" : "会员";
  const brandSubtitle = adminLogin ? "平台治理与账户安全" : coachLogin ? "教练业务工作台" : "鄂州 · 一对一科学训练";
  const brandEyebrow = adminLogin ? "平台治理 · 权限隔离" : coachLogin ? "会员服务 · 训练执行" : "专属训练 · 长期主义";
  const brandTitle = adminLogin
    ? "把系统、账号与数据权限，交给独立管理端。"
    : coachLogin
      ? "专注会员、课程与训练，不被系统管理打断。"
      : "把每一次训练，变成看得见的进步。";
  const brandDescription = adminLogin
    ? "管理账号、角色、审计与平台配置；管理端不进入教练排课和 Hermes 对话。"
    : coachLogin
      ? "使用独立教练账号管理会员、安排课程、维护方案并调用 Hermes 智能助理。"
      : "一对一训练安排、饮食执行与身体趋势，清晰记录在你的专属会员空间。";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registering ? {
          name: data.get("name"),
          phone: data.get("phone"),
          password: data.get("password"),
          confirmPassword: data.get("confirmPassword"),
          acceptedTerms: data.get("acceptedTerms") === "on",
        } : {
          phone: data.get("phone"),
          password: data.get("password"),
          expected_role: requestedRole,
        }),
      });
      const result = await response.json() as { user?: { role?: Role }; error?: string };
      if (!response.ok || !result.user?.role) throw new Error(result.error ?? (registering ? "注册失败" : "登录失败"));
      if (!registering && result.user.role !== requestedRole) {
        throw new Error(`当前账号不是${roleLabel}账号，请使用正确入口登录`);
      }
      onSuccess(result.user.role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${registering ? "注册" : "登录"}失败，请稍后再试`);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "login" | "register") {
    if (busy) return;
    setMode(nextMode);
    setError("");
  }

  return (
    <main className={`login-page ${managementLogin ? "management-login-page login-page-single" : ""} ${adminLogin ? "admin-login-page" : coachLogin ? "coach-login-page" : "member-login-page"}`}>
      {!managementLogin ? <section className="login-brand-panel">
        <div className="brand login-brand"><span className="brand-mark"><Activity size={25} /></span><span><b>邵教练专属会员平台</b><small>{brandSubtitle}</small></span></div>
        <div><span className="eyebrow light">{brandEyebrow}</span><h1>{brandTitle}</h1><p>{brandDescription}</p></div>
        <div className="login-trust">
          <span><ShieldCheck size={18} /> {adminLogin ? "角色与权限独立管理" : coachLogin ? "仅教练可调用管理工具" : "分角色数据访问"}</span>
          <span><LockKeyhole size={18} /> 密码安全加密存储</span>
          <span><CalendarCheck size={18} /> {adminLogin ? "完整操作审计" : "教练统一课程排期"}</span>
        </div>
      </section> : null}
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit} key={mode}>
          {!managementLogin ? <div className="login-mode-switch" role="tablist" aria-label="登录或注册">
            <button type="button" role="tab" aria-selected={!registering} className={!registering ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
            <button type="button" role="tab" aria-selected={registering} className={registering ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
          </div> : <div className={`management-login-badge ${adminLogin ? "admin" : "coach"}`}>{adminLogin ? <ShieldCheck size={18} /> : <Dumbbell size={18} />} {adminLogin ? "管理端独立登录" : "教练端独立登录"}</div>}
          <span className="eyebrow">{registering ? "会员注册" : managementLogin ? requestedRole === "admin" ? "管理后台" : "教练工作台" : "会员登录"}</span>
          <h2>{registering ? "创建会员账号" : managementLogin ? `登录${requestedRole === "admin" ? "管理后台" : "教练工作台"}` : "欢迎回来"}</h2>
          <p>{registering ? "使用中国内地手机号注册，完成后将自动登录。" : managementLogin ? "使用已授权的手机号和密码登录；系统将校验账号角色。" : "使用手机号与密码登录你的专属会员空间。"}</p>
          {registering ? <label><span>姓名</span><div><UserRound size={18} /><input name="name" autoComplete="name" placeholder="请输入真实姓名" minLength={2} maxLength={30} required /></div></label> : null}
          <label><span>手机号</span><div><Smartphone size={18} /><input name="phone" inputMode="numeric" autoComplete="username" placeholder="请输入 11 位手机号" pattern="1[0-9]{10}" required /></div></label>
          <label><span>密码</span><div><LockKeyhole size={18} /><input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "至少 8 位，包含字母和数字" : "请输入登录密码"} minLength={8} maxLength={128} required /></div></label>
          {registering ? <label><span>确认密码</span><div><LockKeyhole size={18} /><input name="confirmPassword" type="password" autoComplete="new-password" placeholder="请再次输入密码" minLength={8} maxLength={128} required /></div></label> : null}
          {registering ? <label className="login-consent"><input name="acceptedTerms" type="checkbox" required /><span>我已阅读并同意 <a href="/terms" target="_blank">用户协议</a> 和 <a href="/privacy" target="_blank">隐私政策</a></span></label> : null}
          {error ? <div className="login-error">{error}</div> : null}
          <button className="button button-primary full" type="submit" disabled={busy}>{busy ? (registering ? "正在创建账号…" : "正在安全登录…") : (registering ? "注册并进入平台" : "登录平台")}</button>
          {!managementLogin ? <button className="login-mode-link" type="button" onClick={() => switchMode(registering ? "login" : "register")}>{registering ? "已有账号？返回登录" : "还没有账号？立即注册"}</button> : <nav className="portal-entry-links" aria-label="其他登录入口"><Link href={adminLogin ? "/coach/login" : "/admin/login"}>{adminLogin ? "教练端" : "管理端"}</Link><Link href="/">会员端</Link></nav>}
          <small>{registering ? "仅开放会员注册；教练与管理员账号由系统管理员创建。" : managementLogin ? `${roleLabel}账号只能从当前专属入口登录，不能与其他角色共用。` : "忘记密码请联系邵教练重置。为保护隐私，请勿共享账号。"}</small>
        </form>
        <footer>© 2026 邵教练专属会员平台 · 鄂州</footer>
      </section>
    </main>
  );
}
