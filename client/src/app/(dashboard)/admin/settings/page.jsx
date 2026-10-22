"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bell,
  Check,
  Download,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Settings as SettingsIcon,
  Sun,
  User,
  X,
} from "lucide-react";
import PasswordStrengthBar from "@/_components/auth/PasswordStrengthBar";
import { changePassword, updateProfile, getPlatformSettings, updatePlatformSettings } from "@/_lib/api/settings";
import {
  getActivityLog,
  getAdminUsers,
  savePermissions,
} from "@/_lib/api/admin";
import LanguageTab from "@/_components/settings/LanguageTab";
import CreateUserModal from "@/_components/admin/CreateUserModal";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "security", label: "Security", icon: Lock },
  { key: "platform", label: "Platform", icon: SettingsIcon },
  { key: "roles", label: "Roles & Permissions", icon: ShieldCheck },
  { key: "language", label: "Language", icon: Globe },
];

const PERMISSION_KEYS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "courses", label: "Courses" },
  { key: "analytics", label: "Analytics" },
  { key: "payments", label: "Payments" },
  { key: "announcements", label: "Announcements" },
  { key: "settings", label: "Settings" },
];

const ACTION_TONE = {
  created_user: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  deactivated_user: { color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  activated_user: { color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  published_course: { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  unpublished_course: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  sent_announcement: { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  updated_permissions: { color: "#F97316", bg: "rgba(249,115,22,0.12)" },
  deleted_course: { color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
};

const ACTION_GROUPS = {
  user: [
    "created_user",
    "deactivated_user",
    "activated_user",
  ],
  course: ["published_course", "unpublished_course", "deleted_course"],
  system: ["sent_announcement", "updated_permissions"],
};

export default function AdminSettingsPage() {
  const [tab, setTab] = useState("profile");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <TabNav tab={tab} setTab={setTab} />
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "profile" && <ProfileTab />}
              {tab === "security" && <SecurityTab />}
              {tab === "platform" && <PlatformTab />}
              {tab === "roles" && <RolesTab />}
              {tab === "language" && (
                <div className="flex flex-col gap-6">
                  <LanguageTab />
                  <AdminThemePicker />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </motion.div>
  );
}

function TabNav({ tab, setTab }) {
  return (
    <nav
      role="tablist"
      className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1 lg:flex-col lg:gap-1 lg:p-2"
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-[#10B981]/10 text-[#10B981]"
                : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2.2} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data: session, update: updateSession } = useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateProfile({ name });
      toast.success("Profile updated");
      if (updateSession) {
        await updateSession({ name });
      }
    } catch {
      toast.error("Couldn't update profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#10B981] text-2xl font-bold text-white shadow-sm">
          A
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {session?.user?.name ?? "Admin"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {session?.user?.email ?? "—"}
          </p>
          <span className="mt-1 inline-flex w-fit rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-bold text-purple-500 font-mono-ui">
            Administrator
          </span>
        </div>
      </div>

      <Field id="ad-name" label="Full name">
        <input
          id="ad-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass()}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ad-email" className="text-sm font-semibold text-[var(--text-primary)]">
          Email
        </label>
        <input
          id="ad-email"
          type="email"
          value={session?.user?.email ?? ""}
          readOnly
          className="w-full cursor-not-allowed rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-secondary)]"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Save Profile
      </button>
    </form>
  );
}

function Field({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function inputClass() {
  return "w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20";
}

// ── Security ───────────────────────────────────────────────────────────────

function SecurityTab() {
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [vals, setVals] = useState({ current: "", next: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);

  const reqs = [
    { label: "At least 8 characters", ok: vals.next.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(vals.next) },
    { label: "One number", ok: /\d/.test(vals.next) },
    {
      label: "Passwords match",
      ok: vals.next.length > 0 && vals.next === vals.confirm,
    },
  ];
  const allOk = reqs.every((r) => r.ok) && vals.current.length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allOk || submitting) return;
    setSubmitting(true);
    try {
      await changePassword({
        current_password: vals.current,
        new_password: vals.next,
      });
      toast.success("Password updated");
      setVals({ current: "", next: "", confirm: "" });
    } catch {
      toast.error("Couldn't update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <header>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Change password
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Use a strong password you don&apos;t reuse anywhere else.
        </p>
      </header>

      <PasswordField
        id="curr"
        label="Current password"
        value={vals.current}
        show={show.current}
        onShow={() => setShow((s) => ({ ...s, current: !s.current }))}
        onChange={(v) => setVals((s) => ({ ...s, current: v }))}
      />
      <PasswordField
        id="next"
        label="New password"
        value={vals.next}
        show={show.next}
        onShow={() => setShow((s) => ({ ...s, next: !s.next }))}
        onChange={(v) => setVals((s) => ({ ...s, next: v }))}
      />
      <PasswordStrengthBar value={vals.next} />
      <PasswordField
        id="confirm"
        label="Confirm new password"
        value={vals.confirm}
        show={show.confirm}
        onShow={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
        onChange={(v) => setVals((s) => ({ ...s, confirm: v }))}
      />

      <ul className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
        {reqs.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2 text-xs font-medium font-mono-ui"
          >
            <span
              className={`grid h-4 w-4 place-items-center rounded-full ${
                r.ok ? "bg-[#10B981] text-white" : "bg-red-500 text-white"
              }`}
            >
              {r.ok ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <X className="h-3 w-3" strokeWidth={3} />
              )}
            </span>
            <span
              className={
                r.ok ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }
            >
              {r.label}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="submit"
        disabled={!allOk || submitting}
        className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Update Password
      </button>
    </form>
  );
}

function PasswordField({ id, label, value, show, onShow, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
        <button
          type="button"
          onClick={onShow}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Platform ───────────────────────────────────────────────────────────────

function PlatformTab() {
  const [platformName, setPlatformName] = useState("Kids In Tech LMS");
  const [welcomeMsg, setWelcomeMsg] = useState(
    "Sign in to manage or continue your learning journey"
  );
  const [color, setColor] = useState("#10B981");
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setPlatformName(data.platform_name ?? "Kids In Tech LMS");
          setWelcomeMsg(data.welcome_message ?? "");
          setColor(data.primary_color ?? "#10B981");
          setLogoPreview(data.logo_url ?? null);
        }
      })
      .catch((err) => console.warn("Failed to load platform settings:", err.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveName() {
    setSavingName(true);
    try {
      await updatePlatformSettings({ platform_name: platformName });
      toast.success("Platform name updated");
    } catch {
      toast.error("Failed to update platform name");
    } finally {
      setSavingName(false);
    }
  }

  async function saveMsg() {
    setSavingMsg(true);
    try {
      await updatePlatformSettings({ welcome_message: welcomeMsg });
      toast.success("Welcome message saved");
    } catch {
      toast.error("Failed to save welcome message");
    } finally {
      setSavingMsg(false);
    }
  }

  async function saveColor() {
    setSavingColor(true);
    try {
      await updatePlatformSettings({ primary_color: color });
      toast.success("Primary color saved");
    } catch {
      toast.error("Failed to save primary color");
    } finally {
      setSavingColor(false);
    }
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Platform Configuration
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Branding and identity settings.
        </p>
      </header>

      <Field id="pl-name" label="Platform Name">
        <div className="flex items-center gap-2">
          <input
            id="pl-name"
            type="text"
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
            className={inputClass()}
          />
          <button
            type="button"
            onClick={saveName}
            disabled={savingName}
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
          >
            {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </Field>

      <Field id="pl-msg" label="Welcome Message">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea
            id="pl-msg"
            rows={3}
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            className={`flex-1 ${inputClass()} resize-y`}
          />
          <button
            type="button"
            onClick={saveMsg}
            disabled={savingMsg}
            className="self-start inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
          >
            {savingMsg && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
          Will update the login page once wired up.
        </p>
      </Field>

      <Field id="pl-color" label="Primary Color">
        <div className="flex items-center gap-3">
          <input
            id="pl-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--border-color)] bg-transparent"
          />
          <span
            aria-hidden="true"
            className="h-10 w-10 rounded-full border border-[var(--border-color)]"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-bold text-[var(--text-primary)] font-mono-ui">
            {color}
          </span>
          <button
            type="button"
            onClick={saveColor}
            disabled={savingColor}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
          >
            {savingColor && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </Field>

      <Field id="pl-logo" label="Logo Upload">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-8 text-center transition-colors hover:border-[#10B981]"
        >
          {logoPreview ? (
            <img
              src={logoPreview}
              alt="Logo preview"
              className="h-16 w-16 rounded-lg object-contain"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-[var(--text-muted)]" />
          )}
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {logoPreview ? "Change logo" : "Click to upload logo"}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] font-mono-ui">
            PNG or SVG · max 1MB
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => toast.success("Logo saved (coming soon)")}
          disabled={!logoPreview}
          className="self-start rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save Logo
        </button>
      </Field>
    </div>
  );
}

// ── Language ───────────────────────────────────────────────────────────────
// LanguageTab is shared from @/_components/settings/LanguageTab. AdminThemePicker
// renders alongside it since admin settings has theme co-located here.

function AdminThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="border-t border-[var(--border-color)] pt-5">
      <h3 className="text-sm font-bold text-[var(--text-primary)]">Theme</h3>
      <div className="mt-3 flex gap-2">
        <ThemeChip
          icon={Sun}
          label="Light"
          active={theme === "light"}
          onClick={() => setTheme("light")}
        />
        <ThemeChip
          icon={Moon}
          label="Dark"
          active={theme === "dark"}
          onClick={() => setTheme("dark")}
        />
      </div>
    </div>
  );
}

function ThemeChip({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
          : "border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ── Roles & Permissions ───────────────────────────────────────────────────

function RolesTab() {
  const { data: session } = useSession();
  const [admins, setAdmins] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);

  // Activity log state — lives in the same tab so admins see their actions
  // alongside the people who can perform them.
  const [activityLog, setActivityLog] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const [logQuery, setLogQuery] = useState("");

  useEffect(() => {
    Promise.all([getAdminUsers(), getActivityLog()])
      .then(([users, log]) => {
        const adminsList = users.filter((u) => u.role === "admin");
        setAdmins(adminsList);
        setActivityLog(log);

        // Populate initial permissions from backend response
        const perms = {};
        adminsList.forEach((u) => {
          perms[u.id] = u.permissions || {
            dashboard: true,
            users: true,
            courses: true,
            analytics: true,
            payments: true,
            announcements: true,
            settings: true,
          };
        });
        setPermissions(perms);
      })
      .catch((err) => console.warn("Roles fetch failed:", err.message));
  }, []);

  const currentEmail = session?.user?.email;

  function togglePermission(userId, key) {
    setPermissions((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [key]: prev[userId] ? !prev[userId][key] : false,
      },
    }));
  }

  async function handleSavePermissions() {
    setSaving(true);
    try {
      await savePermissions({ permissions });
      toast.success("Permissions updated");
    } catch {
      toast.error("Couldn't save permissions");
    } finally {
      setSaving(false);
    }
  }

  function handleAdminCreated(created) {
    setAdmins((prev) => [created, ...prev]);
    setPermissions((prev) => ({
      ...prev,
      [created.id]: created.permissions || {
        dashboard: true,
        users: true,
        courses: true,
        analytics: true,
        payments: true,
        announcements: true,
        settings: true,
      },
    }));
    setActivityLog((prev) => [
      {
        id: `log_${Date.now()}`,
        user_name: session?.user?.name ?? "Admin",
        user_role: "admin",
        action: "created_user",
        description: `Created admin account for ${created.name}`,
        ip: "127.0.0.1",
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  const visibleLog = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    return activityLog.filter((entry) => {
      if (logFilter === "user" && !ACTION_GROUPS.user.includes(entry.action))
        return false;
      if (
        logFilter === "course" &&
        !ACTION_GROUPS.course.includes(entry.action)
      )
        return false;
      if (logFilter === "system" && !ACTION_GROUPS.system.includes(entry.action))
        return false;
      if (q && !entry.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activityLog, logFilter, logQuery]);

  function exportLog() {
    if (visibleLog.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const headers = ["Time", "Admin", "Action", "Description", "IP"];
    const rows = visibleLog.map((e) => [
      e.timestamp,
      e.user_name,
      e.action,
      e.description,
      e.ip,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kit-activity-log.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Activity log exported!");
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Roles &amp; Permissions
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Control which dashboards each admin can access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Admin User
        </button>
      </header>

      <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-xs text-[#10B981] font-mono-ui">
        Super Admin has all permissions by default and cannot be restricted.
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                Admin
              </th>
              {PERMISSION_KEYS.map((p) => (
                <th
                  key={p.key}
                  className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 ? (
              <tr>
                <td colSpan={PERMISSION_KEYS.length + 1} className="p-6 text-center text-sm text-[var(--text-secondary)]">
                  No admin users yet.
                </td>
              </tr>
            ) : (
              admins.map((admin) => {
                const isSuper = admin.email === currentEmail;
                return (
                  <tr key={admin.id} className="border-b border-[var(--border-color)] last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-purple-500 text-xs font-bold text-white">
                          {admin.name?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text-primary)]">
                            {admin.name}
                          </p>
                          {isSuper && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                              Super Admin
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {PERMISSION_KEYS.map((p) => {
                      const granted = isSuper
                        ? true
                        : !!permissions[admin.id]?.[p.key];
                      return (
                        <td key={p.key} className="px-2 py-3 text-center">
                          {isSuper ? (
                            <Check className="mx-auto h-4 w-4 text-[#10B981]" strokeWidth={3} />
                          ) : (
                            <PermissionSwitch
                              checked={granted}
                              onChange={() => togglePermission(admin.id, p.key)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleSavePermissions}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save Permissions
      </button>

      <ActivityLog
        log={visibleLog}
        filter={logFilter}
        setFilter={setLogFilter}
        query={logQuery}
        setQuery={setLogQuery}
        onExport={exportLog}
      />

      <CreateUserModal
        isOpen={openCreate}
        onClose={() => setOpenCreate(false)}
        defaultValues={{ role: "admin" }}
        onCreated={handleAdminCreated}
      />
    </div>
  );
}

function PermissionSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? "bg-[#10B981]" : "bg-[var(--bg-secondary)] border border-[var(--border-color)]"
      }`}
    >
      <motion.span
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}

function ActivityLog({ log, filter, setFilter, query, setQuery, onExport }) {
  const filters = [
    { key: "all", label: "All" },
    { key: "user", label: "User Actions" },
    { key: "course", label: "Course Actions" },
    { key: "system", label: "System" },
  ];
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-[var(--text-primary)]">
          Recent Activity Log
        </h3>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] sm:self-auto font-mono-ui"
        >
          <Download className="h-3.5 w-3.5" />
          Export Log
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by description…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors font-mono-ui ${
                  active
                    ? "border-[#10B981] bg-[#10B981] text-white"
                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {log.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-center text-sm text-[var(--text-secondary)]">
          No activity matches your filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                  Admin
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => {
                const tone =
                  ACTION_TONE[entry.action] ?? {
                    color: "var(--text-secondary)",
                    bg: "var(--bg-secondary)",
                  };
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border-color)] last:border-b-0"
                  >
                    <td className="px-4 py-3 text-[var(--text-muted)] font-mono-ui">
                      {formatDistanceToNow(new Date(entry.timestamp), {
                        addSuffix: true,
                      })}
                      <p className="text-[10px]">
                        {format(new Date(entry.timestamp), "MMM d, HH:mm")}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {entry.user_name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                        style={{ color: tone.color, backgroundColor: tone.bg }}
                      >
                        {entry.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {entry.description}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] font-mono-ui">
                      {entry.ip}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
