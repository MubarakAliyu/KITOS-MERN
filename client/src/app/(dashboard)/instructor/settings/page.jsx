"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Moon,
  Sun,
  User,
  X,
} from "lucide-react";
import PasswordStrengthBar from "@/_components/auth/PasswordStrengthBar";
import LanguageTab from "@/_components/settings/LanguageTab";
import { getInstructorProfile } from "@/_lib/api/instructor";
import { changePassword, updateProfile } from "@/_lib/api/settings";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "security", label: "Security", icon: Lock },
  { key: "language", label: "Language", icon: Globe },
  { key: "notifications", label: "Notifications", icon: Bell },
];

const BIO_MAX = 200;

export default function InstructorSettingsPage() {
  const [tab, setTab] = useState("profile");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Settings
      </h1>

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
              {tab === "language" && (
                <div className="flex flex-col gap-6">
                  <LanguageTab />
                  <ThemePicker />
                </div>
              )}
              {tab === "notifications" && <NotificationsTab />}
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
  const [profile, setProfile] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, isDirty },
  } = useForm({ defaultValues: { name: "", bio: "" } });

  const bio = watch("bio") ?? "";

  useEffect(() => {
    getInstructorProfile()
      .then((p) => {
        setProfile(p);
        reset({ name: p.name, bio: p.bio ?? "" });
      })
      .catch((err) => {
        console.warn("Profile fetch failed:", err.message);
      });
  }, [reset]);

  async function onSubmit(values) {
    if (values.bio.length > BIO_MAX) {
      toast.error(`Bio must be ${BIO_MAX} characters or fewer`);
      return;
    }
    try {
      await updateProfile(values);
      setProfile((prev) => (prev ? { ...prev, ...values } : prev));
      reset(values);
      toast.success("Profile updated");
    } catch {
      toast.error("Couldn't update profile");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#10B981] text-2xl font-bold text-white shadow-sm">
          {profile?.avatar_initial ?? "S"}
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {profile?.name ?? "—"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {profile?.email ?? "—"}
          </p>
          <span className="mt-1 inline-flex w-fit rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-bold text-[#10B981] font-mono-ui">
            Instructor
          </span>
        </div>
      </div>

      <Field id="name" label="Full name">
        <input
          id="name"
          type="text"
          {...register("name")}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-[var(--text-primary)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={profile?.email ?? ""}
          readOnly
          className="w-full cursor-not-allowed rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-secondary)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="bio" className="text-sm font-semibold text-[var(--text-primary)]">
            Bio
          </label>
          <span
            className={`text-[11px] font-mono-ui ${
              bio.length > BIO_MAX
                ? "text-red-500"
                : "text-[var(--text-muted)]"
            }`}
          >
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          rows={4}
          maxLength={BIO_MAX}
          placeholder="Share a short bio that students will see…"
          {...register("bio")}
          className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Save Changes
      </button>
    </form>
  );
}

function Field({ id, label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>
      )}
    </div>
  );
}

// ── Security ───────────────────────────────────────────────────────────────

function SecurityTab() {
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [vals, setVals] = useState({ current: "", next: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);

  const reqs = passwordRequirements(vals);
  const allOk = reqs.every((r) => r.ok) && vals.current.length > 0;

  function update(name, value) {
    setVals((v) => ({ ...v, [name]: value }));
  }

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <header>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Change password
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Use a strong password you don&apos;t reuse anywhere else.
        </p>
      </header>

      <PasswordField
        id="current"
        label="Current password"
        value={vals.current}
        show={show.current}
        onShow={() => setShow((s) => ({ ...s, current: !s.current }))}
        onChange={(v) => update("current", v)}
      />
      <PasswordField
        id="next"
        label="New password"
        value={vals.next}
        show={show.next}
        onShow={() => setShow((s) => ({ ...s, next: !s.next }))}
        onChange={(v) => update("next", v)}
      />
      <PasswordStrengthBar value={vals.next} />
      <PasswordField
        id="confirm"
        label="Confirm new password"
        value={vals.confirm}
        show={show.confirm}
        onShow={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
        onChange={(v) => update("confirm", v)}
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

function passwordRequirements(vals) {
  return [
    { label: "At least 8 characters", ok: vals.next.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(vals.next) },
    { label: "One number", ok: /\d/.test(vals.next) },
    {
      label: "Passwords match",
      ok: vals.next.length > 0 && vals.next === vals.confirm,
    },
  ];
}

// ── Language ───────────────────────────────────────────────────────────────
// LanguageTab is shared from @/_components/settings/LanguageTab. ThemePicker
// stays here because theme is a sibling preference scoped to this page.

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="border-t border-[var(--border-color)] pt-5">
      <h3 className="text-sm font-bold text-[var(--text-primary)]">Theme</h3>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        Light mode for daytime, dark mode for late-night sessions.
      </p>
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

// ── Notifications ──────────────────────────────────────────────────────────

const NOTIFICATION_TOGGLES = [
  { key: "submission", label: "New assignment submission" },
  { key: "enroll", label: "Student enrolled in my course" },
  { key: "quiz", label: "Student quiz completed" },
  { key: "message", label: "New message from student" },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState(() =>
    NOTIFICATION_TOGGLES.reduce((acc, t) => ({ ...acc, [t.key]: true }), {})
  );

  function toggle(key) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Notifications
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Pick which updates you want to receive.
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)]">
        {NOTIFICATION_TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {t.label}
            </span>
            <Switch checked={prefs[t.key]} onChange={() => toggle(t.key)} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => toast.success("Preferences saved")}
        className="self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        Save Preferences
      </button>
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked
          ? "bg-[#10B981]"
          : "bg-[var(--bg-secondary)] border border-[var(--border-color)]"
      }`}
    >
      <motion.span
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}
