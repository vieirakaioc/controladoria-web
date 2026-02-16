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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
  LayoutDashboard,
  CalendarCheck2,
  ListChecks,
  Upload,
  Menu,
  LogOut,
} from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type NavItem = {
  href: string;
  label: string;
  icon: any;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");

  const navItems: NavItem[] = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/runs", label: "Runs", icon: CalendarCheck2 },
      { href: "/templates", label: "Templates", icon: ListChecks },
      { href: "/import", label: "Import", icon: Upload },
    ],
    []
  );

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

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
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
      <div className="min-h-screen flex items-center justify-center text-sm opacity-70">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile menu */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Menu">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72">
                  <div className="font-semibold mb-4">Controladoria</div>
                  <NavLinks />
                </SheetContent>
              </Sheet>
            </div>

            <div className="font-semibold">Controladoria</div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/templates")}>
              + New template
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>
                      {(userEmail?.[0] || "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-xs opacity-80 max-w-[220px] truncate">
                    {userEmail || "User"}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={logout} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Logout
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
