"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { adminViewHelp, type AdminView } from "../../lib/crm/admin-navigation";
export type { AdminView } from "../../lib/crm/admin-navigation";

export type IconName = "activity" | "arrow-up-right" | "briefcase" | "calendar" | "chart" | "chevron-down" | "chevron-left" | "external" | "globe" | "grid" | "layers" | "link" | "menu" | "plus" | "search" | "settings" | "sparkles" | "users" | "x";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, ReactNode> = {
    activity: <><path d="M3 12h4l2.2-6 4.4 12 2.2-6H21" /></>,
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h3M7 17h3" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    external: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
    settings: <><circle cx="12" cy="12" r="3.5" /><path d="M19.4 15a2 2 0 1 0 0 2.8M4.6 9a2 2 0 1 0 0-2.8M15 4.6a2 2 0 1 0 2.8 0M9 19.4a2 2 0 1 0-2.8 0M4 12h2M18 12h2M12 4v2M12 18v2" /></>,
    sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.6-3.3 2.5-5 6-5s5.4 1.7 6 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.2.2 3.5 1.5 4 4" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const navigation: { label: string; items: { label: AdminView; icon: IconName }[] }[] = [
  { label: "Your day", items: [{ label: "Overview", icon: "grid" }, { label: "Tasks", icon: "layers" }, { label: "Calendar", icon: "calendar" }] },
  { label: "Grow your business", items: [{ label: "Outreach & Follow-up", icon: "activity" }, { label: "Lead Finder", icon: "search" }, { label: "Sales", icon: "briefcase" }, { label: "Metrics", icon: "chart" }] },
  { label: "Client delivery", items: [{ label: "Clients", icon: "users" }, { label: "Websites", icon: "globe" }] },
  { label: "Tools & settings", items: [{ label: "JARVIS CEO", icon: "sparkles" }, { label: "Integrations", icon: "link" }] },
];

type ShellProps = {
  activeView: AdminView;
  collapsed: boolean;
  mobileOpen: boolean;
  connected: boolean;
  loading: boolean;
  onNavigate: (view: AdminView) => boolean | void;
  onCreateTask?: () => void;
  onToggleCollapsed: () => void;
  onToggleMobile: () => void;
  children: ReactNode;
};

export function AdminShell({ activeView, collapsed, mobileOpen, connected, loading, onNavigate, onCreateTask, onToggleCollapsed, onToggleMobile, children }: ShellProps) {
  const [navQuery, setNavQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const term = navQuery.trim().toLowerCase();
  const groups = navigation.map((group) => ({ ...group, items: group.items.filter((item) => !term || `${item.label} ${adminViewHelp[item.label]}`.toLowerCase().includes(term)) })).filter((group) => group.items.length);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseRef.current?.focus();
    const desktop = window.matchMedia("(min-width: 821px)");
    const onResize = (event: MediaQueryListEvent) => { if (event.matches) onToggleMobile(); };
    desktop.addEventListener("change", onResize);
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onToggleMobile(); }
      if (event.key === "Tab") {
        const elements = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]') || []).filter((element) => element.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", close); desktop.removeEventListener("change", onResize); previous?.focus(); };
  }, [mobileOpen, onToggleMobile]);

  const navigate = (view: AdminView) => {
    if (onNavigate(view) !== false) { setNavQuery(""); if (mobileOpen) onToggleMobile(); }
  };
  return <main className={`admin-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-nav-open" : ""}`}>
    <a className="admin-skip-link" href="#admin-main">Skip to workspace content</a>
    {mobileOpen ? <button className="admin-mobile-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={onToggleMobile} /> : null}
    <aside ref={sidebarRef} className="admin-sidebar" inert={isMobile && !mobileOpen} aria-hidden={isMobile && !mobileOpen ? true : undefined} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Harley’s workspace navigation">
      <div className="admin-brand"><span className="admin-brand-mark">H</span><span className="admin-brand-copy">HBS <small>ADMIN</small></span><button className="admin-collapse-button" onClick={() => { setNavQuery(""); onToggleCollapsed(); }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}><Icon name="chevron-left" size={16} /></button><button ref={mobileCloseRef} className="admin-mobile-close" onClick={onToggleMobile} aria-label="Close navigation"><Icon name="x" /></button></div>
      <div className="admin-workspace-select"><span className="admin-workspace-avatar">H</span><span className="admin-workspace-copy"><strong>Harley&apos;s workspace</strong><small>Owner · Super admin</small></span></div>
      <label className="admin-nav-search"><Icon name="search" size={16} /><input ref={searchRef} value={navQuery} onChange={(event) => setNavQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && navQuery) { event.stopPropagation(); setNavQuery(""); } }} placeholder="Find a section…" aria-label="Find a CRM section" /></label>
      <nav className="admin-nav" aria-label="Main sections">
        {groups.map((group) => <div className="admin-nav-group" key={group.label}><div className="admin-nav-label">{group.label}</div>{group.items.map((item) => <button key={item.label} title={collapsed ? item.label : adminViewHelp[item.label]} aria-label={item.label} className={`admin-nav-item ${activeView === item.label ? "active" : ""}`} aria-current={activeView === item.label ? "page" : undefined} onClick={() => navigate(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div>)}
        {!groups.length ? <p className="admin-nav-empty" role="status">No sections found.<button type="button" onClick={() => { setNavQuery(""); searchRef.current?.focus(); }}>Clear search</button></p> : null}
      </nav>
      <div className="admin-sidebar-bottom"><div className="admin-profile"><span className="admin-profile-avatar">H</span><span className="admin-profile-copy"><strong>Harley</strong><small>Owner · Super admin</small></span><span className="admin-online-dot" title="Online" /></div></div>
    </aside>
    <section className="admin-content" inert={mobileOpen}>
      <header className="admin-topbar">
        <div className="admin-topbar-title"><button className="admin-mobile-menu" onClick={onToggleMobile} aria-label="Open navigation" aria-expanded={mobileOpen}><Icon name="menu" /></button><div><h1>{activeView}</h1><p className="admin-page-description">{adminViewHelp[activeView]}</p></div></div>
        <div className="admin-topbar-actions"><span className={`admin-saved ${connected ? "connected" : ""}`}><i />{connected ? "Live data" : loading ? "Connecting…" : "Check connection"}</span>{onCreateTask ? <button className="admin-outline-button admin-global-task" type="button" onClick={onCreateTask}><Icon name="plus" size={16} />New task</button> : null}<a className="admin-outline-button" href="/portal" target="_blank" rel="noreferrer" aria-label="Open client portal in a new tab"><Icon name="external" size={14} /><span>Client portal</span></a><span className="admin-account-mark" title="Harley · Owner">H</span></div>
      </header>
      {children}
    </section>
  </main>;
}

export function MetricCard({ icon, tone, label, value, detail }: { icon: IconName; tone: string; label: string; value: ReactNode; detail: ReactNode }) {
  return <article className="admin-stat-card"><span className={`admin-stat-icon ${tone}`}><Icon name={icon} size={18} /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
