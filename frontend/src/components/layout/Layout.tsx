import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { BarChart3, Bot, Moon, Sun, Plus, Trash2, Pencil, MessageSquare, ChevronsLeft, ChevronsRight, Settings, Layers, Languages, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useDarkMode } from "@/hooks/useDarkMode";
import { api, type SessionItem } from "@/lib/api";
import { useAgentStore } from "@/stores/agent";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";

// Bump on each release; one place keeps the footer in sync with package.json.
const APP_VERSION = "v0.1.8";

// Inject popover animation keyframes once
if (typeof document !== "undefined" && !document.getElementById("popover-keyframes")) {
  const style = document.createElement("style");
  style.id = "popover-keyframes";
  style.textContent = `@keyframes popoverIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}`;
  document.head.appendChild(style);
}

// NAV entries: `key` looks up label in i18n; `label` overrides (used for "Alpha Zoo").
const NAV = [
  { to: "/", icon: BarChart3, key: "home" as const, label: null },
  { to: "/agent", icon: Bot, key: "agent" as const, label: null },
  { to: "/alpha-zoo", icon: Layers, key: "alphaZoo" as const, label: "Alpha Zoo" },
  { to: "/settings", icon: Settings, key: "settings" as const, label: null },
  { to: "/correlation", icon: BarChart3, key: "correlation" as const, label: null },
];

export function Layout() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { t, locale, setLocale } = useI18n();
  const { dark, toggle } = useDarkMode();
  const toggleLocale = () => setLocale(locale === "zh" ? "en" : "zh");
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const sseStatus = useAgentStore(s => s.sseStatus);
  const sseRetryAttempt = useAgentStore(s => s.sseRetryAttempt);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("qa-sidebar") === "collapsed");

  const activeSessionId = searchParams.get("session");

  useEffect(() => {
    localStorage.setItem("qa-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const loadSessions = () => {
    api.listSessions()
      .then((list) => setSessions(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  // Load sessions on mount. Also refresh when navigating TO /agent or when
  // the active session changes (covers new session creation from Agent).
  const isAgentPage = pathname.startsWith("/agent");
  useEffect(() => { loadSessions(); }, [isAgentPage, activeSessionId]);

  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (menuTarget === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuTarget(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuTarget]);

  const deleteSession = async (sid: string) => {
    try {
      await api.deleteSession(sid);
      setSessions((prev) => prev.filter((s) => s.session_id !== sid));
    } catch { /* ignore */ }
    setDeleteTarget(null);
  };

  const renameSession = async (sid: string) => {
    if (!renameValue.trim()) { setRenameTarget(null); return; }
    try {
      await api.renameSession(sid, renameValue.trim());
      setSessions((prev) => prev.map((s) => s.session_id === sid ? { ...s, title: renameValue.trim() } : s));
    } catch { /* ignore */ }
    setRenameTarget(null);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "border-r bg-card flex flex-col shrink-0 transition-all duration-200",
        collapsed ? "w-12" : "w-64"
      )}>
        {/* Brand */}
        <div className={cn("border-b", collapsed ? "p-2 flex justify-center" : "p-4")}>
          <Link to="/" className={cn("flex items-center font-bold text-base tracking-tight", collapsed ? "justify-center" : "gap-2")}>
            <BarChart3 className="h-5 w-5 text-primary shrink-0" />
            {!collapsed && "Deep-Trace"}
          </Link>
        </div>

        {/* Nav */}
        <nav className={cn("space-y-0.5", collapsed ? "p-1" : "p-2")}>
          {NAV.map(({ to, icon: Icon, key, label }) => {
            const text = label ?? t[key];
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center rounded-md text-sm transition-colors",
                  collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                  (to === "/" ? pathname === "/" : pathname.startsWith(to))
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={collapsed ? text : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && text}
              </Link>
            );
          })}
        </nav>

        {/* Sessions — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 overflow-auto border-t mt-2 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {t.sessions}
              </span>
              <Link
                to="/agent"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={t.newChat}
              >
                <Plus className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="px-2 pb-2 space-y-0.5 overflow-auto flex-1">
              {sessionsLoading ? (
                <div className="space-y-1.5 px-2 py-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-7 rounded-md bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground/60">{t.noSessions}</p>
              ) : null}
              {sessions.map((s) => {
                const isActive = s.session_id === activeSessionId;
                const isDeleting = deleteTarget === s.session_id;
                const isRenaming = renameTarget === s.session_id;
                const isMenuOpen = menuTarget === s.session_id;
                return (
                  <div key={s.session_id} className={cn("group relative flex items-center", isMenuOpen && "z-40")}>
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameSession(s.session_id); if (e.key === "Escape") setRenameTarget(null); }}
                        onBlur={() => renameSession(s.session_id)}
                        className="flex-1 min-w-0 pl-3 pr-2 py-1 rounded-md text-xs border border-primary bg-background outline-none"
                      />
                    ) : (
                      <Link
                        to={`/agent?session=${s.session_id}`}
                        className={cn(
                          "flex-1 min-w-0 pl-3 pr-8 py-1.5 rounded-md text-xs transition-colors truncate block border-l-2",
                          isActive
                            ? "border-l-primary bg-primary/10 text-primary font-medium"
                            : "border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        title={s.title || s.session_id}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            s.status === "failed" ? "bg-danger" : isActive ? "bg-warning" : "bg-success/60"
                          )} />
                          {s.title || s.session_id.slice(0, 16)}
                        </span>
                      </Link>
                    )}
                    {isDeleting && (
                      <div className="absolute inset-0 z-40 flex items-center justify-center rounded-md bg-white dark:bg-[hsl(220,20%,10%)]">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDeleteTarget(null)} className="px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted transition-colors">{t.cancelDelete}</button>
                          <button onClick={() => deleteSession(s.session_id)} className="px-2 py-0.5 rounded text-[10px] font-medium text-white bg-danger hover:bg-danger/90 transition-colors">{t.confirmDelete}</button>
                        </div>
                      </div>
                    )}
                    {!isRenaming && !isDeleting && (
                      <div className={cn(
                        "absolute right-0 top-0 bottom-0 z-30 flex items-center rounded-md transition-opacity",
                        isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        "bg-muted",
                        "hover:bg-muted/70"
                      )} ref={isMenuOpen ? menuRef : undefined}>
                        <div className="h-full flex items-center px-1.5">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuTarget(isMenuOpen ? null : s.session_id); setDeleteTarget(null); }}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isMenuOpen ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                          )}
                          title="More"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        </div>
                        {isMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-md border bg-white dark:bg-[hsl(220,20%,10%)] p-1 shadow-md" style={{ animation: "popoverIn 0.15s ease-out" }}>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuTarget(null); setRenameTarget(s.session_id); setRenameValue(s.title || ""); }}
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              {t.rename}
                            </button>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuTarget(null); setDeleteTarget(s.session_id); }}
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              {t.deleteConfirm}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Spacer when collapsed */}
        {collapsed && <div className="flex-1" />}

        {/* Footer */}
        <div className={cn("border-t", collapsed ? "p-1 flex flex-col items-center gap-1" : "p-3 space-y-2")}>
          {collapsed ? (
            <>
              <button onClick={toggleLocale} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title={locale === "zh" ? "English" : "中文"}>
                <Languages className="h-3.5 w-3.5" />
              </button>
              <button onClick={toggle} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title={dark ? t.lightMode : t.darkMode}>
                {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setCollapsed(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title="Expand">
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggle}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    {dark ? t.lightMode : t.darkMode}
                  </button>
                  <button
                    onClick={toggleLocale}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {locale === "zh" ? "EN" : "中文"}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCollapsed(true)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title="Collapse"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/60">{APP_VERSION}</p>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ConnectionBanner status={sseStatus} retryAttempt={sseRetryAttempt} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
