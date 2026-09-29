"use client";

import { ReactNode, useEffect } from "react";

export type AdminView = "Overview" | "Websites" | "Pipeline" | "Clients" | "Tasks" | "AI Assistant" | "Integrations";
export type IconName = "activity" | "arrow-up-right" | "briefcase" | "chevron-down" | "chevron-left" | "external" | "globe" | "grid" | "layers" | "link" | "menu" | "plus" | "search" | "settings" | "sparkles" | "users" | "x";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, ReactNode> = {
    activity: <><path d="M3 12h4l2.2-6 4.4 12 2.2-6H21" /></>,
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
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
  { label: "Workspace", items: [{ label: "Overview", icon: "grid" }, { label: "Websites", icon: "globe" }] },
  { label: "CRM", items: [{ label: "Pipeline", icon: "activity" }, { label: "Clients", icon: "users" }, { label: "Tasks", icon: "layers" }] },
  { label: "Tools", items: [{ label: "AI Assistant", icon: "sparkles" }, { label: "Integrations", icon: "link" }] },
];

type ShellProps = {
  activeView: AdminView;
  collapsed: boolean;
  mobileOpen: boolean;
  connected: boolean;
  loading: boolean;
  onNavigate: (view: AdminView) => void;
  onToggleCollapsed: () => void;
  onToggleMobile: () => void;
  children: ReactNode;
};

export function AdminShell({ activeView, collapsed, mobileOpen, connected, loading, onNavigate, onToggleCollapsed, onToggleMobile, children }: ShellProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onToggleMobile(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen, onToggleMobile]);

  const navigate = (view: AdminView) => { onNavigate(view); if (mobileOpen) onToggleMobile(); };
  return <main className={`admin-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-nav-open" : ""}`}>
    {mobileOpen ? <button className="admin-mobile-backdrop" aria-label="Close navigation" onClick={onToggleMobile} /> : null}
    <aside className="admin-sidebar" aria-label="Harley’s workspace navigation">
      <div className="admin-brand"><span className="admin-brand-mark">H</span><span className="admin-brand-copy">HBS <small>ADMIN</small></span><button className="admin-collapse-button" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><Icon name="chevron-left" size={16} /></button></div>
      <button className="admin-workspace-select" aria-label="Harley’s workspace"><span className="admin-workspace-avatar">H</span><span className="admin-workspace-copy"><strong>Harley&apos;s workspace</strong><small>Business operations</small></span><Icon name="chevron-down" size={14} /></button>
      <nav className="admin-nav">
        {navigation.map((group) => <div className="admin-nav-group" key={group.label}><div className="admin-nav-label">{group.label}</div>{group.items.map((item) => <button key={item.label} title={collapsed ? item.label : undefined} className={`admin-nav-item ${activeView === item.label ? "active" : ""}`} aria-current={activeView === item.label ? "page" : undefined} onClick={() => navigate(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div>)}
      </nav>
      <div className="admin-sidebar-bottom">
        <button className="admin-nav-item" title={collapsed ? "Settings" : undefined}><Icon name="settings" /><span>Settings</span></button>
        <div className="admin-profile"><span className="admin-profile-avatar">H</span><span className="admin-profile-copy"><strong>Harley</strong><small>Owner · Super admin</small></span><span className="admin-online-dot" title="Online" /></div>
      </div>
    </aside>
    <section className="admin-content">
      <header className="admin-topbar">
        <div className="admin-topbar-title"><button className="admin-mobile-menu" onClick={onToggleMobile} aria-label="Open navigation" aria-expanded={mobileOpen}><Icon name="menu" /></button><div><span className="admin-eyebrow">Harley&apos;s workspace / {activeView}</span><h1>{activeView}</h1></div></div>
        <div className="admin-topbar-actions"><span className={`admin-saved ${connected ? "connected" : ""}`}><i />{connected ? "Live data connected" : loading ? "Connecting securely…" : "Connection needs attention"}</span><a className="admin-outline-button" href="/portal" target="_blank" rel="noreferrer"><Icon name="external" size={14} /><span>Client portal</span></a><button className="admin-avatar-button" aria-label="Harley account">H</button></div>
      </header>
      {children}
    </section>
  </main>;
}

export function MetricCard({ icon, tone, label, value, detail }: { icon: IconName; tone: string; label: string; value: ReactNode; detail: ReactNode }) {
  return <article className="admin-stat-card"><span className={`admin-stat-icon ${tone}`}><Icon name={icon} size={18} /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
