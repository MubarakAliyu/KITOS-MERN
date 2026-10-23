"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  MessageSquare,
  Settings,
  Users,
  CreditCard,
  BarChart2,
  Award,
  Bell,
  Video,
  Film,
  ClipboardCheck,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useSidebarStore } from "@/_store/sidebarStore";
import { useNotificationStore } from "@/_store/notificationStore";
import { useLanguage } from "@/_lib/i18n/LanguageContext";
import LogoutModal from "@/_components/ui/LogoutModal";
import KitLogo from "@/_components/brand/KitLogo";
import PoweredByStarNova from "@/_components/brand/PoweredByStarNova";

const ICONS = {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  MessageSquare,
  Settings,
  Users,
  CreditCard,
  BarChart2,
  Award,
  Bell,
  Video,
  Film,
  ClipboardCheck,
  PlayCircle,
};

// Nav items per role. `labelKey` resolves through the LanguageContext so the
// sidebar switches languages instantly when the preference changes.
const NAV_ITEMS = {
  student: [
    { labelKey: "nav.dashboard", icon: "LayoutDashboard", href: "/student" },
    { labelKey: "nav.myCourses", icon: "BookOpen", href: "/student/courses" },
    { labelKey: "nav.onlineClasses", label: "Online Classes", icon: "Video", href: "/student/sessions" },
    { labelKey: "nav.recordings", label: "Recordings", icon: "Film", href: "/student/recordings" },
    { labelKey: "nav.assignments", icon: "ClipboardList", href: "/student/assignments" },
    { labelKey: "nav.certificates", icon: "Award", href: "/student/certificates" },
    { labelKey: "nav.notifications", icon: "Bell", href: "/student/notifications" },
    { labelKey: "nav.chat", icon: "MessageSquare", href: "/student/chat" },
    { labelKey: "nav.settings", icon: "Settings", href: "/student/settings" },
  ],
  parent: [
    { labelKey: "nav.dashboard", icon: "LayoutDashboard", href: "/parent" },
    { labelKey: "nav.myChildren", icon: "Users", href: "/parent/children" },
    { labelKey: "nav.payments", icon: "CreditCard", href: "/parent/payments" },
    { labelKey: "nav.chat", icon: "MessageSquare", href: "/parent/chat" },
    { labelKey: "nav.notifications", icon: "Bell", href: "/parent/notifications" },
    { labelKey: "nav.settings", icon: "Settings", href: "/parent/settings" },
  ],
  instructor: [
    { labelKey: "nav.dashboard", icon: "LayoutDashboard", href: "/instructor" },
    { labelKey: "nav.myCourses", icon: "BookOpen", href: "/instructor/courses" },
    { labelKey: "nav.manageSessions", label: "Manage Sessions", icon: "Video", href: "/instructor/sessions" },
    { labelKey: "nav.students", icon: "Users", href: "/instructor/students" },
    { labelKey: "nav.assignments", icon: "ClipboardList", href: "/instructor/assignments" },
    { labelKey: "nav.chat", icon: "MessageSquare", href: "/instructor/chat" },
    { labelKey: "nav.notifications", icon: "Bell", href: "/instructor/notifications" },
    { labelKey: "nav.settings", icon: "Settings", href: "/instructor/settings" },
  ],
  admin: [
    { labelKey: "nav.dashboard", icon: "LayoutDashboard", href: "/admin" },
    { labelKey: "nav.users", icon: "Users", href: "/admin/users" },
    { labelKey: "nav.courses", icon: "BookOpen", href: "/admin/courses" },
    { labelKey: "nav.liveSessions", label: "Live Sessions", icon: "Video", href: "/admin/sessions" },
    { labelKey: "nav.attendanceReports", label: "Attendance Reports", icon: "ClipboardCheck", href: "/admin/sessions/attendance" },
    { labelKey: "nav.adminRecordings", label: "Recordings", icon: "PlayCircle", href: "/admin/sessions/recordings" },
    { labelKey: "nav.analytics", icon: "BarChart2", href: "/admin/analytics" },
    { labelKey: "nav.payments", icon: "CreditCard", href: "/admin/payments" },
    { labelKey: "nav.chat", icon: "MessageSquare", href: "/admin/chat" },
    { labelKey: "nav.notifications", icon: "Bell", href: "/admin/notifications" },
    { labelKey: "nav.settings", icon: "Settings", href: "/admin/settings" },
  ],
};

function isItemActive(pathname, href, role) {
  if (pathname === href) return true;
  if (href === `/${role}`) return false;
  return pathname.startsWith(`${href}/`);
}

function getInitials(session) {
  const email = session?.user?.email ?? "";
  return email.slice(0, 1).toUpperCase() || "?";
}

export default function Sidebar() {
  const { isOpen, isCollapsed, toggleCollapse, close } = useSidebarStore();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const items = NAV_ITEMS[role] ?? [];

  const [showLogout, setShowLogout] = useState(false);

  return (
    <>
      {/* Desktop */}
      <motion.aside
        animate={{ width: isCollapsed ? 64 : 240 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative hidden h-screen shrink-0 flex-col border-r bg-[var(--bg-sidebar)] border-[var(--sidebar-border)] md:sticky md:top-0 md:flex"
      >
        <SidebarBody
          items={items}
          role={role}
          session={session}
          isCollapsed={isCollapsed}
          onLogout={() => setShowLogout(true)}
        />
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-secondary)] hover:text-[#10B981]"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </motion.aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="sidebar-mobile"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed left-0 top-0 z-50 flex h-full w-[260px] flex-col border-r bg-[var(--bg-sidebar)] border-[var(--sidebar-border)] shadow-xl md:hidden"
            >
              <SidebarBody
                items={items}
                role={role}
                session={session}
                isCollapsed={false}
                onItemClick={close}
                onLogout={() => {
                  close();
                  setShowLogout(true);
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <LogoutModal
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
      />
    </>
  );
}

function SidebarBody({ items, role, session, isCollapsed, onItemClick, onLogout }) {
  const pathname = usePathname();
  const { unreadCount } = useNotificationStore();
  const { t } = useLanguage();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Logo block */}
      <div className="flex items-center gap-2.5 border-b border-[var(--sidebar-border)] px-3 py-4">
        {/* The logotype carries the name itself, so it stands in for both the
            old bolt icon and the "Kids In Tech" wordmark that sat beside it.
            Collapsed, it falls back to the square mark — the same logo
            letterboxed, with no tile behind it. The block keeps its 36px
            content height either way, so the nav below does not move. */}
        {isCollapsed ? (
          <KitLogo
            variant="mark"
            className="h-9 w-9 shrink-0 object-contain"
            priority
          />
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <KitLogo
              variant="full"
              className="h-10 w-auto shrink-0 object-contain"
              priority
            />
            <span className="rounded-md bg-[#10B981] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
              LMS
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isItemActive(pathname, item.href, role);
            const showBadge =
              item.href.endsWith("/notifications") && unreadCount > 0;
            const label = t(item.labelKey, item.label);
            return (
              <li key={item.href}>
                <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.15 }}>
                  <Link
                    href={item.href}
                    onClick={onItemClick}
                    title={isCollapsed ? label : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#10B981]/10 text-[#10B981]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                    } ${isCollapsed ? "justify-center" : ""}`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-[#10B981]"
                      />
                    )}
                    {Icon && (
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          active ? "text-[#10B981]" : "text-[var(--text-secondary)]"
                        }`}
                        strokeWidth={2.2}
                      />
                    )}
                    {!isCollapsed && <span className="truncate flex-1">{label}</span>}
                    {showBadge && !isCollapsed && (
                      <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white font-mono-ui">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                    {showBadge && isCollapsed && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </Link>
                </motion.div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User block */}
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <div
          className={`flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-2.5 ${
            isCollapsed ? "justify-center" : ""
          }`}
          title={
            isCollapsed
              ? session?.user?.admission_no ?? session?.user?.email
              : undefined
          }
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#10B981] text-sm font-bold text-white">
            {getInitials(session)}
          </div>
          {!isCollapsed && (
            <div className="flex min-w-0 flex-col">
              {role === "student" ? (
                <>
                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {session?.user?.name ?? "—"}
                  </span>
                  <span className="truncate text-xs font-mono font-semibold text-[#10B981]">
                    {session?.user?.admission_no ??
                      session?.user?.email ??
                      "—"}
                  </span>
                </>
              ) : (
                <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {session?.user?.email ?? "—"}
                </span>
              )}
              {role && role !== "student" && (
                <span className="w-fit rounded bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
                  {role}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onLogout}
          title={isCollapsed ? t("nav.logout") : undefined}
          className={`mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-500 ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4" strokeWidth={2.2} />
          {!isCollapsed && <span>{t("nav.logout")}</span>}
        </button>

        {/* The very bottom of the sidebar, below the user card and Logout.
            Collapsed, it falls back to the StarNova mark with a tooltip. */}
        <PoweredByStarNova collapsed={isCollapsed} className="mt-1 w-full" />
      </div>
    </div>
  );
}
