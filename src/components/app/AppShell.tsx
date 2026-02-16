"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
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
  CalendarCheck2,
  ListChecks,
  ClipboardList,
  Menu,
  LogOut,
  Plus,
} from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NavItem = {
  href: string;
  label: string;
  icon: any;
};

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);

  // ✅ Menu do APP (logado)
  // /import fica fora do shell (rota pública/utility), então não entra aqui
  const navItems: NavItem[] = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/runs", label: "Runs", icon: CalendarCheck2 },
      { href: "/templates", label: "Templates", icon: ListChecks },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
    ],
    []
  );

  async function checkSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      router.replace("/login");
      return;
    }

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
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cx(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/70 opacity-90"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border px-4 py-3 text-sm opacity-80">
          Loading workspace...
        </div>
      </div>
    );
  }

  const userInitial = (userEmail?.[0] || "U").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Menu">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>

                <SheetContent side="left" className="w-72">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-semibold">Controladoria</div>
                    <div className="text-xs opacity-60">v0</div>
                  </div>

                  <NavLinks onNavigate={() => {}} />
                </SheetContent>
              </Sheet>
            </div>

            <Link href="/dashboard" className="font-semibold">
              Controladoria <span className="text-xs opacity-60 ml-2">v0</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* CTA principal */}
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => router.push("/templates/new")}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New template</span>
              <span className="sm:hidden">New</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>{userInitial}</AvatarFallback>
                  </Avatar>

                  <span className="hidden sm:inline text-xs opacity-80 max-w-[220px] truncate">
                    {userEmail || "User"}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-[220px]">
                <div className="px-2 py-1.5 text-xs opacity-70">
                  Signed in as
                  <div className="truncate font-medium opacity-100">
                    {userEmail || "User"}
                  </div>
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={logout} className="gap-2" disabled={loggingOut}>
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar desktop */}
          <aside className="hidden md:block col-span-3 lg:col-span-2 py-6">
            <div className="rounded-lg border p-3">
              <div className="text-xs opacity-70 mb-2">Navigation</div>
              <NavLinks />
            </div>

            <div className="mt-3 rounded-lg border p-3 text-xs opacity-70">
              Tip: use <b>Templates</b> pra criar rotinas e <b>Runs</b> pra executar.
            </div>
          </aside>

          {/* Main */}
          <main className="col-span-12 md:col-span-9 lg:col-span-10 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
