"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

function SidebarLink({ href, label, currentPath, collapsed }) {
  const active = currentPath === href || currentPath.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed ? "justify-center" : "justify-start",
      ].join(" ")}
      title={label}
    >
      {collapsed ? label.slice(0, 1) : label}
    </Link>
  );
}

export default function HrShell({ children, currentPath = "/hr-admin/dashboard", heading = "HR Command Center" }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = useMemo(
    () => [
      { href: "/hr-admin/dashboard", label: "Dashboard" },
      { href: "/hr-admin/cases", label: "Cases" },
    ],
    []
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-muted/20">
      <aside
        className={[
          "border-r bg-background p-3 transition-all duration-200",
          collapsed ? "w-20" : "w-72",
        ].join(" ")}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className={collapsed ? "hidden" : "block"}>
            <p className="text-xl font-semibold tracking-tight">JUSTRA</p>
            <p className="text-xs text-muted-foreground">HR Officer Workspace</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? ">" : "<"}
          </Button>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              currentPath={currentPath}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
