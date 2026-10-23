"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { Bell, LogOut, Menu, Settings as SettingsIcon, User } from "lucide-react";
import { useSidebarStore } from "@/_store/sidebarStore";
import { useNotificationStore } from "@/_store/notificationStore";
import { useAuthStore } from "@/_store/authStore";
import { useLanguage } from "@/_lib/i18n/LanguageContext";
import NotificationDropdown from "@/_components/notifications/NotificationDropdown";
import { ThemeToggle } from "@/_components/ui/ThemeToggle";

// Map each top-level dashboard route to the locale key that names it. The
// title is resolved via t() at render time so language changes are immediate.
const ROUTE_TITLE_KEYS = {
  "/student": "nav.dashboard",
  "/student/courses": "nav.myCourses",
  "/student/lessons": "nav.lessons",
  "/student/assignments": "nav.assignments",
  "/student/certificates": "nav.certificates",
  "/student/chat": "nav.chat",
  "/student/notifications": "nav.notifications",
  "/student/settings": "nav.settings",
  "/parent": "nav.dashboard",
  "/parent/children": "nav.myChildren",
  "/parent/payments": "nav.payments",
  "/parent/chat": "nav.chat",
  "/parent/notifications": "nav.notifications",
  "/parent/settings": "nav.settings",
  "/instructor": "nav.dashboard",
  "/instructor/courses": "nav.myCourses",
  "/instructor/students": "nav.students",
  "/instructor/assignments": "nav.assignments",
  "/instructor/chat": "nav.chat",
  "/instructor/notifications": "nav.notifications",
  "/instructor/settings": "nav.settings",
  "/admin": "nav.dashboard",
  "/admin/users": "users.userManagement",
  "/admin/courses": "nav.courses",
  "/admin/analytics": "analytics.analytics",
  "/admin/payments": "payments.payments",
  "/admin/chat": "chat.monitorTitle",
  "/admin/notifications": "nav.notifications",
  "/admin/settings": "nav.settings",
};

function routeTitleKey(pathname) {
  if (ROUTE_TITLE_KEYS[pathname]) return ROUTE_TITLE_KEYS[pathname];
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 1) {
    segments.pop();
    const key = `/${segments.join("/")}`;
    if (ROUTE_TITLE_KEYS[key]) return ROUTE_TITLE_KEYS[key];
  }
  return "nav.dashboard";
}

function getInitials(session) {
  const email = session?.user?.email ?? "";
  return email.slice(0, 1).toUpperCase() || "?";
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const { toggleOpen } = useSidebarStore();
  const { unreadCount } = useNotificationStore();
  const { languagePreference } = useAuthStore();
  const { t } = useLanguage();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  // Shake the bell whenever the unread counter increases — that's the
  // visible signal that a liveNotify event just landed in the store.
  const bellControls = useAnimation();
  const prevUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      bellControls.start({
        rotate: [0, 15, -15, 10, -10, 5, -5, 0],
        transition: { duration: 0.5 },
      });
    }
    prevUnread.current = unreadCount;
  }, [unreadCount, bellControls]);

  const role = session?.user?.role;
  const settingsHref = role ? `/${role}/settings` : "/login";
  const title = t(routeTitleKey(pathname));

  const closeAll = () => {
    setNotifOpen(false);
    setUserOpen(false);
  };

  return (
    <header className="relative z-30 flex h-16 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-4 sm:px-6">
      {(notifOpen || userOpen) && (
        <div
          className="fixed inset-0 z-20"
          onClick={closeAll}
          aria-hidden="true"
        />
      )}

      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleOpen}
          aria-label="Toggle sidebar"
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-[var(--text-primary)] sm:text-xl">{title}</h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => router.push(settingsHref)}
          // The visible text is the language code, so it has to appear in
          // the accessible name too (WCAG 2.5.3, Label in Name) — otherwise
          // someone using voice control cannot say what they can see.
          aria-label={`${t("settings.languagePreference")}: ${(languagePreference || "en").toUpperCase()}`}
          title={t("settings.languagePreference")}
          className="rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] font-mono-ui"
        >
          {(languagePreference || "en").toUpperCase()}
        </button>

        <ThemeToggle />

        {/* Notification bell */}
        <div className="relative z-30">
          <button
            type="button"
            onClick={() => {
              setUserOpen(false);
              setNotifOpen((v) => !v);
            }}
            // The badge caps at "9+", so the accessible name has to use the
            // same text: WCAG 2.5.3 wants the visible label inside the
            // accessible name, and "16" is not what the user can see.
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount > 9 ? "9+" : unreadCount} unread`
                : "Notifications"
            }
            aria-expanded={notifOpen}
            className="relative grid h-9 w-9 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
          >
            <motion.span animate={bellControls} style={{ display: "inline-flex" }}>
              <Bell className="h-5 w-5" />
            </motion.span>
            {unreadCount > 0 && (
              <motion.span
                animate={{ scale: [1, 1.18, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <NotificationDropdown onClose={() => setNotifOpen(false)} />
            )}
          </AnimatePresence>
        </div>

        <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--border-color)] sm:block" />

        {/* User avatar */}
        <div className="relative z-30">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setUserOpen((v) => !v);
            }}
            aria-label="User menu"
            aria-expanded={userOpen}
            className="grid h-9 w-9 place-items-center rounded-full bg-[#10B981] text-sm font-bold text-white shadow-sm transition-transform hover:scale-105"
          >
            {getInitials(session)}
          </button>
          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
              >
                <div className="border-b border-[var(--border-color)] px-4 py-3">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {session?.user?.name ?? session?.user?.email ?? "—"}
                  </p>
                  {role === "student" && session?.user?.admission_no ? (
                    <p className="mt-0.5 truncate text-xs font-mono font-semibold text-[#10B981]">
                      {session.user.admission_no}
                    </p>
                  ) : (
                    session?.user?.email && (
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)] font-mono-ui">
                        {session.user.email}
                      </p>
                    )
                  )}
                  {role && (
                    <span className="mt-1 inline-flex w-fit rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
                      {role}
                    </span>
                  )}
                </div>
                <div className="flex flex-col py-1">
                  <Link
                    href={settingsHref}
                    onClick={closeAll}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
                    role="menuitem"
                  >
                    <User className="h-4 w-4" /> {t("settings.profile")}
                  </Link>
                  <Link
                    href={settingsHref}
                    onClick={closeAll}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
                    role="menuitem"
                  >
                    <SettingsIcon className="h-4 w-4" /> {t("nav.settings")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex items-center gap-2 px-4 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" /> {t("nav.logout")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
