"use client";

import { useMemo, useState } from "react";

type IconName =
  | "arrow-up-right"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "code"
  | "copy"
  | "external"
  | "folder"
  | "github"
  | "globe"
  | "grid"
  | "layers"
  | "lock"
  | "link"
  | "menu"
  | "more"
  | "paperclip"
  | "plus"
  | "rocket"
  | "search"
  | "settings"
  | "sparkles"
  | "sun"
  | "terminal"
  | "undo"
  | "redo"
  | "x";

function Icon({ name, size = 16, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    code: <><path d="m8 9-4 3 4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    external: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    folder: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v7A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5z" /></>,
    github: <><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.7-1.6 6.7-7A5.5 5.5 0 0 0 19.2 3.7 5.1 5.1 0 0 0 19.1 0S18 0 15.5 1.5a13.4 13.4 0 0 0-7 0C6 0 4.9 0 4.9 0a5.1 5.1 0 0 0-.1 3.7A5.5 5.5 0 0 0 3.3 7.5c0 5.4 3.4 6.6 6.7 7A4.8 4.8 0 0 0 9 18v4" /><path d="M9 18c-4.5 2-5-2-7-2" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    paperclip: <path d="m20.5 11.5-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.3 9.3a2 2 0 0 1-2.8-2.8l8.8-8.8" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    rocket: <><path d="M4.5 16.5c-1.3 1.1-1.5 3-1.5 3s1.9-.2 3-1.5c.8-.8.8-2.2 0-3s-1.2-.8-1.5 0Z" /><path d="M12 15s-3-1-3-4c0-4 5-8 11-8 0 6-4 11-8 11Z" /><path d="m14 14 3 3" /><circle cx="16.5" cy="7.5" r="1" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1M4.6 9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1M15 4.6 15.1 4a2 2 0 1 1 3.9.8l-.1.2M9 19.4 8.9 20a2 2 0 1 1-3.9-.8l.1-.2M4.6 15 4 15.1a2 2 0 1 1 .8-3.9l.2.1M19.4 9 20 8.9a2 2 0 1 1-.8 3.9l-.2-.1M9 4.6 8.9 4a2 2 0 1 1 3.9.8l-.1.2M15 19.4l.1.6a2 2 0 1 1-3.9-.8l.1-.2" /></>,
    sparkles: <><path d="m12 3-1.1 4.1A4 4 0 0 1 8 10l-4 1 4 1a4 4 0 0 1 2.9 2.9L12 19l1.1-4.1A4 4 0 0 1 16 12l4-1-4-1a4 4 0 0 1-2.9-2.9z" /><path d="m19 3 .3 1.2L20.5 5l-1.2.3L19 6.5l-.3-1.2-1.2-.3 1.2-.3z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    terminal: <><path d="m5 7 5 5-5 5M13 17h6" /></>,
    undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6v1" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12H10a6 6 0 0 0-6 6v1" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const initialProjects = [
  { name: "Sonder Studio", type: "Portfolio", color: "peach", active: true },
  { name: "Northstar", type: "Marketing site", color: "blue", active: false },
  { name: "Lumina Journal", type: "Editorial", color: "lavender", active: false },
];

const initialMessages = [
  { role: "assistant", text: "I’ve got a starting point for Sonder Studio. What would you like to shape first?" },
  { role: "user", text: "Make the hero feel more editorial and add a projects section." },
  { role: "assistant", text: "Done — I pushed the layout toward a quieter, magazine-inspired feel and added a featured projects grid below the fold." },
];

export default function Home() {
  const [projects, setProjects] = useState(initialProjects);
  const [messages, setMessages] = useState(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [view, setView] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState({ github: true, vercel: true, supabase: false });

  const activeProject = projects.find((project) => project.active) ?? projects[0];
  const projectLabel = useMemo(() => activeProject?.name ?? "Untitled project", [activeProject]);

  function selectProject(name: string) {
    setProjects((current) => current.map((project) => ({ ...project, active: project.name === name })));
    setNotice(`${name} is now open`);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function createProject() {
    const next = { name: `Untitled ${projects.length + 1}`, type: "New project", color: "mint", active: true };
    setProjects((current) => [...current.map((project) => ({ ...project, active: false })), next]);
    setNotice("New project created");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function submitPrompt(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setPrompt("");
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: trimmed, project: projectLabel }) });
      const data = await response.json();
      setMessages((current) => [...current, { role: "assistant", text: data.message ?? "I’ve applied that change to your canvas." }]);
      setNotice("Canvas updated");
      window.setTimeout(() => setNotice(""), 2200);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "I’m ready to make that change. Connect an AI provider to generate the full implementation." }]);
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleConnection(key: keyof typeof connected) {
    setConnected((current) => ({ ...current, [key]: !current[key] }));
    setNotice(connected[key] ? "Plugin disconnected" : "Plugin connected");
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon name="sparkles" size={17} /></span><span>framecraft</span><span className="brand-beta">BETA</span></div>
        <button className="workspace-select"><span className="workspace-avatar">J</span><span className="workspace-copy"><strong>Jordan&apos;s workspace</strong><small>Personal</small></span><Icon name="chevron-down" size={14} /></button>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-item active"><Icon name="grid" />Projects <span className="nav-count">{projects.length}</span></button>
          <button className="nav-item"><Icon name="layers" />Templates</button>
          <button className="nav-item"><Icon name="link" />Connections <span className="connection-dot" /></button>
        </nav>
        <div className="sidebar-section-heading"><span>Your projects</span><button className="icon-button" aria-label="Create project" onClick={createProject}><Icon name="plus" size={15} /></button></div>
        <div className="project-list">
          {projects.map((project) => <button key={project.name} className={`project-item ${project.active ? "selected" : ""}`} onClick={() => selectProject(project.name)}><span className={`project-thumb ${project.color}`}><span /></span><span><strong>{project.name}</strong><small>{project.type}</small></span><Icon name="more" size={15} /></button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="upgrade-card"><span className="upgrade-icon"><Icon name="rocket" size={16} /></span><div><strong>Ship faster</strong><p>Get more generations with Pro.</p></div><Icon name="arrow-up-right" size={14} /></div>
          <button className="nav-item"><Icon name="settings" />Settings</button>
          <div className="profile"><span className="profile-avatar">JM</span><span><strong>Jordan Miller</strong><small>jordan@sonder.studio</small></span><Icon name="more" size={15} /></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="breadcrumb"><span className="muted">Projects</span><Icon name="chevron-right" size={13} /><strong>{projectLabel}</strong><span className="saved"><span />Saved</span></div><div className="topbar-actions"><button className="ghost-button" onClick={() => setNotice("Preview link copied")}><Icon name="external" size={14} />Open live site</button><button className="publish-button" onClick={() => setNotice("Ready to publish from Vercel")}>Publish <Icon name="arrow-up-right" size={14} /></button><button className="avatar-button">JM</button></div></header>
            <div className="builder-toolbar"><div className="tool-group"><button className="toolbar-button" aria-label="Undo"><Icon name="undo" size={15} /></button><button className="toolbar-button disabled" aria-label="Redo"><Icon name="redo" size={15} /></button><span className="toolbar-divider" /><button className={`device-button ${view === "desktop" ? "active" : ""}`} onClick={() => setView("desktop")}><span className="desktop-device" />Desktop</button><button className={`device-button ${view === "tablet" ? "active" : ""}`} onClick={() => setView("tablet")}><span className="tablet-device" /></button><button className={`device-button ${view === "mobile" ? "active" : ""}`} onClick={() => setView("mobile")}><span className="mobile-device" /></button></div><div className="toolbar-center"><span className="status-pulse" />{isGenerating ? "Generating changes..." : "All changes saved"}</div><div className="tool-group"><button className="toolbar-button"><Icon name="code" size={15} /></button><button className="toolbar-button"><Icon name="more" size={15} /></button></div></div>
        <div className="builder-body">
          <div className={`canvas-area ${view}`}>
            <div className="canvas-topline"><div className="browser-dots"><i /><i /><i /></div><span>sonder.studio</span><Icon name="lock" size={13} /></div>
            {tab === "preview" ? <div className="site-preview">
              <div className="site-nav"><span className="site-logo">SONDER<span>®</span></span><div className="site-links"><span>Work</span><span>About</span><span>Journal</span></div><button>Let&apos;s talk <Icon name="arrow-up-right" size={13} /></button></div>
              <div className="hero"><div className="hero-kicker"><span className="orange-dot" />Independent creative studio · London / Everywhere</div><h1>We make<br /><em>space</em> for<br />good ideas.</h1><div className="hero-bottom"><p>Brand, digital, and moving image for people building a more thoughtful future.</p><span className="scroll-hint">Scroll to explore <Icon name="chevron-down" size={13} /></span></div><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /></div>
              <div className="project-strip"><div><span className="section-number">01 — 03</span><h2>Selected<br /><em>work</em></h2></div><div className="project-card-large"><div className="project-art"><span>01</span><b>ALTO<br /><small>Objects for slow living</small></b></div><div className="project-meta"><span>Alto Objects</span><span>Brand identity · Digital</span></div></div><div className="project-card-small"><div className="small-art"><span>02</span><div className="small-art-line" /></div><div className="project-meta"><span>Field Notes</span><span>Editorial · 2024</span></div></div></div>
            </div> : <div className="code-preview"><div className="code-line muted-code">01&nbsp;&nbsp; <span>export default function</span> SonderHome() {'{'}</div><div className="code-line">02&nbsp;&nbsp;&nbsp;&nbsp; <span className="pink-code">return</span> (&lt;main className=<span className="green-code">&quot;hero&quot;</span>&gt;</div><div className="code-line">03&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;h1&gt;We make space for good ideas.&lt;/h1&gt;</div><div className="code-line">04&nbsp;&nbsp; {'</'}main&gt;)</div><div className="code-line">05&nbsp; {'}'}</div><div className="code-note"><Icon name="sparkles" size={14} /> Ask the assistant to edit your code</div></div>}
            <div className="canvas-footer"><div className="preview-tabs"><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Icon name="globe" size={14} />Preview</button><button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")}><Icon name="code" size={14} />Code</button></div><span>⌘ K to command</span></div>
          </div>
          <aside className="assistant-panel">
            <div className="assistant-header"><div><div className="eyebrow"><span className="ai-spark"><Icon name="sparkles" size={13} /></span>Framecraft AI</div><h2>Build with intention.</h2></div><button className="icon-button"><Icon name="more" size={16} /></button></div>
            <div className="assistant-context"><span className="context-icon"><Icon name="folder" size={14} /></span><span><small>Editing</small><strong>{projectLabel}</strong></span><button><Icon name="chevron-down" size={13} /></button></div>
            <div className="conversation">
              {messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.role === "assistant" && <span className="message-mark"><Icon name="sparkles" size={12} /></span>}<div className="message-bubble">{message.text}</div></div>)}
              {isGenerating && <div className="message assistant"><span className="message-mark"><Icon name="sparkles" size={12} /></span><div className="message-bubble thinking"><span /><span /><span /></div></div>}
            </div>
            <div className="suggestion-row"><button onClick={() => setPrompt("Make the type scale more expressive")}>Make the type more expressive <Icon name="arrow-up-right" size={12} /></button><button onClick={() => setPrompt("Add a dark footer with contact details")}>Add a dark footer <Icon name="arrow-up-right" size={12} /></button></div>
            <form className="prompt-box" onSubmit={submitPrompt}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a change..." rows={2} /><div className="prompt-footer"><button type="button" className="attach-button"><Icon name="paperclip" size={16} /></button><span>⌘ ↵</span><button className="send-button" type="submit" disabled={!prompt.trim() || isGenerating}><Icon name="arrow-up-right" size={15} /></button></div></form>
            <div className="assistant-footer"><span>Powered by Framecraft AI</span><button><Icon name="settings" size={13} /> Model</button></div>
          </aside>
        </div>
      </section>

      <div className="connections-drawer"><div className="drawer-heading"><span>Connected tools</span><button className="icon-button"><Icon name="x" size={15} /></button></div><div className="drawer-tools"><button className={connected.github ? "tool-connected" : ""} onClick={() => toggleConnection("github")}><Icon name="github" size={17} /><span><strong>GitHub</strong><small>{connected.github ? "sonder-studio / main" : "Connect repository"}</small></span><span className="tool-state">{connected.github ? "Connected" : "Connect"}</span></button><button className={connected.vercel ? "tool-connected" : ""} onClick={() => toggleConnection("vercel")}><span className="vercel-mark">▲</span><span><strong>Vercel</strong><small>{connected.vercel ? "sonder-studio" : "Deploy your project"}</small></span><span className="tool-state">{connected.vercel ? "Connected" : "Connect"}</span></button><button className={connected.supabase ? "tool-connected" : ""} onClick={() => toggleConnection("supabase")}><span className="supabase-mark">⌁</span><span><strong>Supabase</strong><small>{connected.supabase ? "studio workspace" : "Connect database"}</small></span><span className="tool-state">{connected.supabase ? "Connected" : "Connect"}</span></button></div></div>
      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
    </main>
  );
}

