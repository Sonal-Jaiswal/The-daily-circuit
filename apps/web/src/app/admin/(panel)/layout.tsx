import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, LifeBuoy, Briefcase, FileText, Inbox, LayoutDashboard, ListChecks, Mail, Rss, Settings, Tags, Users, Workflow } from "lucide-react";
import { Logomark } from "@/components/site-chrome";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/admin";

// Every admin view reads the session and live data, so navigations may block.
export const instant = false;

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/articles", label: "Articles", icon: FileText },
  { href: "/admin/candidates", label: "Candidates", icon: ListChecks },
  { href: "/admin/jobs", label: "Jobs", icon: Workflow },
  { href: "/admin/sources", label: "Sources", icon: Rss },
  { href: "/admin/taxonomy", label: "Categories & tags", icon: Tags },
  { href: "/admin/usage", label: "AI usage", icon: BarChart3 },
  { href: "/admin/messages", label: "Messages", icon: Inbox },
  { href: "/admin/subscribers", label: "Subscribers", icon: Mail },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/help", label: "How to use", icon: LifeBuoy },
];

async function UserBadge() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-ink-2 sm:inline">
        {user.name} <span className="text-ink-3">({user.role.toLowerCase()})</span>
      </span>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-border bg-surface lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logomark className="size-7" />
          <Link href="/admin" className="font-black tracking-[-0.03em]">
            Newsroom
          </Link>
          <Link href="/" className="ml-auto text-xs font-semibold text-neel hover:underline">
            View site
          </Link>
        </div>
        <nav aria-label="Dashboard" className="overflow-x-auto px-2 pb-3 lg:pb-6">
          <ul className="flex gap-1 lg:flex-col">
            {NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-muted hover:text-ink">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Briefcase className="size-4" aria-hidden="true" /> The Daily Circuit
          </p>
          <Suspense fallback={null}>
            <UserBadge />
          </Suspense>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6">
          <Suspense fallback={<p className="text-sm text-ink-3">Loading…</p>}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
