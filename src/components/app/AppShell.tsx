"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
  LayoutDashboard,
  CalendarDays,
  KanbanSquare,
  ListChecks,
  Upload,
  Menu,
  LogOut,
  Search,
  Plus,
  PanelLeft,
  Settings,
  ListTodo,
  CalendarCheck2,
} from "lucide-react";

import { Users } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NavItem = { href: string; label: string; icon: any };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");

  // sidebar state (collapsible)
  const [collapsed, setCollapsed] = useState(false);

  // Load persisted state
  useEffect(() => {
    try {
      const v = localStorage.getItem("ui.sidebarCollapsed");
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  function toggleSidebar() {
    setCollapsed((p) => {
      const next = !p;
      try {
        localStorage.setItem("ui.sidebarCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const navPrimary: NavItem[] = useMemo(
    () => [
      { href: "/tasks", label: "List", icon: ListChecks },
      { href: "/board", label: "Board", icon: ListTodo },
      { href: "/kanban", label: "Kanban", icon: KanbanSquare },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
    []
  );

  // ✅ ADD /runs em Setup
  const navAdmin: NavItem[] = useMemo(
    () => [
      { href: "/templates", label: "Templates", icon: Settings },
      { href: "/runs", label: "Runs", icon: CalendarCheck2 },
      { href: "/import", label: "Import", icon: Upload },
      { href: "/people", label: "People", icon: Users },
    ],
    []
  );

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  function currentSectionLabel() {
    const all = [...navPrimary, ...navAdmin];
    const hit = all.find((x) => isActive(x.href));
    return hit?.label || "Controladoria";
  }

  async function checkSession() {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }
    setUserEmail(u.email || "");
    setCheckingAuth(false);
  }

  useEffect(() => {
    checkSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function NavLinks({
    items,
    onNavigate,
  }: {
    items: NavItem[];
    onNavigate?: () => void;
  }) {
    return (
      <nav className="space-y-1">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={item.label}
              className={cx(
                "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                collapsed ? "justify-center" : "justify-start",
                active
                  ? "bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-cyan-500/10 ring-1 ring-indigo-500/20"
                  : "hover:bg-muted/60 opacity-90"
              )}
            >
              <div
                className={cx(
                  "h-9 w-9 rounded-md grid place-items-center transition",
                  active ? "bg-background/60" : "bg-muted/30 group-hover:bg-muted/60"
                )}
              >
                <Icon className={cx("h-4 w-4", active ? "text-foreground" : "text-foreground/80")} />
              </div>

              {!collapsed && (
                <div className="min-w-0">
                  <div className={cx("font-medium truncate", active ? "text-foreground" : "text-foreground/90")}>
                    {item.label}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm opacity-70">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="flex min-h-screen">
        {/* Sidebar (desktop) */}
        <aside
          className={cx(
            "hidden md:flex flex-col border-r bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50",
            collapsed ? "w-[72px]" : "w-[280px]"
          )}
        >
          {/* Sidebar header */}
          <div className="h-14 px-3 flex items-center justify-between border-b">
            <div className={cx("flex items-center gap-2 min-w-0", collapsed && "justify-center w-full")}>
              {!collapsed && (
                <div className="font-semibold truncate">
                  Controladoria
                  <span className="ml-2 text-xs font-normal opacity-60">/ {currentSectionLabel()}</span>
                </div>
              )}
              {collapsed && <div className="font-semibold">C</div>}
            </div>

            {!collapsed && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Collapse sidebar">
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Expand sidebar">
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="p-3 space-y-4 flex-1 overflow-y-auto">
            {!collapsed && <div className="text-[11px] uppercase tracking-wide opacity-60 px-1">Views</div>}
            <NavLinks items={navPrimary} />

            <div className="pt-2" />
            {!collapsed && <div className="text-[11px] uppercase tracking-wide opacity-60 px-1">Setup</div>}
            <NavLinks items={navAdmin} />
          </div>

          {/* Sidebar footer */}
          <div className="p-3 border-t">
            <div className={cx("rounded-xl border bg-background p-3", collapsed && "p-2")}>
              {!collapsed ? (
                <>
                  <div className="text-[11px] uppercase tracking-wide opacity-60">Space</div>
                  <div className="text-sm font-semibold mt-1">Controladoria</div>
                  <div className="text-xs opacity-70">Checklist / Rotinas</div>
                </>
              ) : (
                <div className="text-xs font-semibold text-center">S</div>
              )}
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
            <div className="h-14 px-3 sm:px-4 flex items-center gap-3">
              {/* Mobile menu */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Menu">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80">
                    <div className="font-semibold mb-4">Controladoria</div>

                    <div className="text-xs opacity-70 mb-2">Views</div>
                    <NavLinks items={navPrimary} onNavigate={() => {}} />

                    <div className="text-xs opacity-70 mt-6 mb-2">Setup</div>
                    <NavLinks items={navAdmin} onNavigate={() => {}} />
                  </SheetContent>
                </Sheet>
              </div>

              {/* Breadcrumb / title */}
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  Controladoria <span className="opacity-60">/ {currentSectionLabel()}</span>
                </div>
              </div>

              {/* Search */}
              <div className="hidden lg:flex items-center gap-2 rounded-xl border bg-background px-2 h-9 w-[420px]">
                <Search className="h-4 w-4 opacity-60" />
                <Input
                  className="border-0 h-8 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                  placeholder="Search tasks..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const q = (e.target as HTMLInputElement).value.trim();
                      router.push(`/tasks${q ? `?q=${encodeURIComponent(q)}` : ""}`);
                    }
                  }}
                />
              </div>

              {/* New */}
              <Button className="gap-2 rounded-xl" onClick={() => router.push("/templates")}>
                <Plus className="h-4 w-4" />
                New
              </Button>

              {/* User */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 rounded-xl">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback>{(userEmail?.[0] || "U").toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-xs opacity-80 max-w-[220px] truncate">
                      {userEmail || "User"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push("/import")} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import Excel
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={logout} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Content */}
          <main className="p-3 sm:p-4 md:p-6">
            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
