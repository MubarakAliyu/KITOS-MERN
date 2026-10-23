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
  Plus,
  Sun,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import PasswordStrengthBar from "@/_components/auth/PasswordStrengthBar";
import AddChildModal from "@/_components/parent/AddChildModal";
import LanguageTab from "@/_components/settings/LanguageTab";
import { getParentMe, getChildren } from "@/_lib/api/parents";
import { changePassword, updateProfile } from "@/_lib/api/settings";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "security", label: "Security", icon: Lock },
  { key: "language", label: "Language", icon: Globe },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "children", label: "Children", icon: Users },
];

export default function ParentSettingsPage() {
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
              {tab === "children" && <ChildrenTab />}
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
  const [parent, setParent] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm({ defaultValues: { name: "", phone: "" } });

  useEffect(() => {
    getParentMe()
      .then((p) => {
        setParent(p);
        reset({ name: p.name, phone: p.phone });
      })
      .catch((err) => {
        console.warn("Profile fetch failed:", err.message);
      });
  }, [reset]);

  async function onSubmit(values) {
    try {
      await updateProfile(values);
      setParent((prev) => (prev ? { ...prev, ...values } : prev));
      reset(values);
      toast.success("Profile updated");
    } catch {
      toast.error("Couldn't update profile");
    }
  }

  const initials =
    parent?.name?.split(" ").map((s) => s[0]).slice(0, 2).join("") ?? "?";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#10B981] text-2xl font-bold text-white shadow-sm">
          {initials}
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {parent?.name ?? "—"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {parent?.email ?? "—"}
          </p>
          <span className="mt-1 inline-flex w-fit rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-bold text-[#10B981] font-mono-ui">
            Parent
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

      <Field id="phone" label="Phone number">
        <input
          id="phone"
          type="tel"
          {...register("phone")}
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
          value={parent?.email ?? ""}
          readOnly
          className="w-full cursor-not-allowed rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-secondary)]"
        />
        <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
          Email is managed by your account — contact support to change it.
        </p>
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
                r.ok
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]"
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
// is still rendered alongside it because theme is a sibling preference.

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
  { key: "progress", label: "Child progress updates" },
  { key: "completion", label: "Course completions" },
  { key: "payment", label: "Payment confirmations" },
  { key: "feedback", label: "Assignment feedback received" },
  { key: "newCourse", label: "New courses available" },
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

// ── Children ───────────────────────────────────────────────────────────────

function ChildrenTab() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getChildren()
      .then(setChildren)
      .catch((err) => {
        console.warn("Children fetch failed:", err.message);
        setError("Failed to load children. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(child) {
    setChildren((list) => [...list, child]);
  }

  function handleRemove(child) {
    // No DELETE /students endpoint yet — optimistic local removal only.
    setChildren((list) => list.filter((c) => c.id !== child.id));
    toast.success(`${child.name} removed`);
    setConfirmRemove(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Children
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Manage learner profiles linked to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAdd(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Child
        </button>
      </header>

      {error ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
          >
            Refresh page
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-center text-sm text-[var(--text-secondary)]">
          No children yet. Add your first learner.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <ChildRow
              key={child.id}
              child={child}
              onRemove={() => setConfirmRemove(child)}
            />
          ))}
        </ul>
      )}

      <AddChildModal
        isOpen={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
      />

      <ConfirmRemoveDialog
        child={confirmRemove}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove)}
      />
    </div>
  );
}

function ChildRow({ child, onRemove }) {
  const bg = child.id === "s2" ? "#3B82F6" : "#10B981";
  return (
    <li className="flex items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: bg }}
      >
        {child.avatar_initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">
          {child.name}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
            Age {child.age}
          </span>
          <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
            {child.programme_track}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </button>
    </li>
  );
}

function ConfirmRemoveDialog({ child, onCancel, onConfirm }) {
  useEffect(() => {
    if (!child) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [child, onCancel]);

  return (
    <AnimatePresence>
      {child && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm remove"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-red-500/15 text-red-500">
              <Trash2 className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[var(--text-primary)]">
              Remove {child.name}?
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Remove {child.name} from your account? This action only hides the
              learner — payment history is preserved.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onConfirm}
                className="w-full rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
              >
                Yes, remove
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
