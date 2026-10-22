"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Ban,
  BookOpen,
  CheckCircle,
  Eye,
  Pencil,
  Plus,
  Search,
  Users,
} from "lucide-react";
import {
  activateUser,
  getAdminCourses,
  getAdminUsers,
  getPendingEnrollments,
} from "@/_lib/api/admin";
import UserDetailModal from "@/_components/admin/UserDetailModal";
import DeactivateConfirmModal from "@/_components/admin/DeactivateConfirmModal";
import AssignInstructorModal from "@/_components/admin/AssignInstructorModal";
import CreateUserModal from "@/_components/admin/CreateUserModal";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const ROLE_TONE = {
  admin: { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  instructor: { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  student: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  parent: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
};

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "students", label: "Students", role: "student" },
  { key: "parents", label: "Parents", role: "parent" },
  { key: "instructors", label: "Instructors", role: "instructor" },
  { key: "admins", label: "Admins", role: "admin" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const [openDetail, setOpenDetail] = useState(null);
  const [openDeactivate, setOpenDeactivate] = useState(null);
  const [openAssign, setOpenAssign] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [createDefaults, setCreateDefaults] = useState(null);
  const [userToEdit, setUserToEdit] = useState(null);
  const { notify } = useLiveNotify();

  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAdminUsers(),
      getPendingEnrollments(),
      getAdminCourses(),
    ])
      .then(([u, p, c]) => {
        setUsers(u);
        setPending(p);
        setCourses(c?.courses ?? c ?? []);
      })
      .catch((err) => {
        console.warn("Users fetch failed:", err.message);
        setError("Failed to load users. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  const counts = useMemo(() => {
    const byRole = users.reduce(
      (acc, u) => {
        acc[u.role] = (acc[u.role] ?? 0) + 1;
        return acc;
      },
      {}
    );
    return {
      all: users.length,
      pending: pending.length,
      students: byRole.student ?? 0,
      parents: byRole.parent ?? 0,
      instructors: byRole.instructor ?? 0,
      admins: byRole.admin ?? 0,
    };
  }, [users, pending]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;
    const tabSpec = TABS.find((t) => t.key === tab);
    if (tabSpec?.role) list = list.filter((u) => u.role === tabSpec.role);
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.admission_no?.toLowerCase().includes(q)
    );
  }, [users, tab, query]);

  const instructors = useMemo(
    () => users.filter((u) => u.role === "instructor"),
    [users]
  );

  function handleDeactivated(id) {
    const target = users.find((u) => u.id === id);
    setUsers((list) =>
      list.map((u) => (u.id === id ? { ...u, status: "inactive" } : u))
    );
    if (target) notify("user_deactivated", { name: target.name });
  }

  async function handleActivate(user) {
    try {
      await activateUser(user.id);
      setUsers((list) =>
        list.map((u) => (u.id === user.id ? { ...u, status: "active" } : u))
      );
      toast.success("User activated");
    } catch {
      toast.error("Couldn't activate user");
    }
  }

  function handleProvisioned(created, pendingId) {
    setUsers((prev) => [created, ...prev]);
    if (pendingId) setPending((prev) => prev.filter((p) => p.id !== pendingId));
    setCreateDefaults(null);
    notify("user_created", { name: created?.name });
  }

  function handleUserUpdated(updated) {
    setUsers((list) =>
      list.map((u) => (u.id === updated.id ? updated : u))
    );
    setUserToEdit(null);
  }

  function handleAssigned(instructorId, courseId) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    
    setUsers((list) =>
      list.map((u) => {
        if (u.id === instructorId) {
          const teaching = u.teaching_courses ?? [];
          if (!teaching.includes(course.title)) {
            return { ...u, teaching_courses: [...teaching, course.title] };
          }
        }
        return u;
      })
    );
  }

  function openProvisionFor(p) {
    setCreateDefaults({
      pending_id: p.id,
      role: "student",
      name: p.child_name,
      age: p.age,
      programme_track: p.programme_track,
    });
    setOpenCreate(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            User Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Provision accounts, deactivate users, and assign instructors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateDefaults(null);
            setOpenCreate(true);
          }}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add User
        </button>
      </header>

      <nav role="tablist" className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors font-mono-ui ${
                active
                  ? "text-[#10B981]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-bold">
                {count}
              </span>
              {active && (
                <motion.span
                  layoutId="admin-users-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-[#10B981]"
                  transition={{ type: "spring", stiffness: 280, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {tab !== "pending" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or admission no…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
      )}

      {error ? (
        <ErrorState message={error} />
      ) : tab === "pending" ? (
        <PendingList items={pending} onProvision={openProvisionFor} />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Identifier</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u, i) => (
                <UserRow
                  key={u.id}
                  user={u}
                  index={i}
                  onView={() => setOpenDetail(u)}
                  onEdit={() => {
                    setUserToEdit(u);
                    setOpenCreate(true);
                  }}
                  onDeactivate={() => setOpenDeactivate(u)}
                  onActivate={() => handleActivate(u)}
                  onAssign={() => setOpenAssign(u)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserDetailModal user={openDetail} onClose={() => setOpenDetail(null)} />
      <DeactivateConfirmModal
        user={openDeactivate}
        onClose={() => setOpenDeactivate(null)}
        onDeactivated={handleDeactivated}
      />
      <AssignInstructorModal
        isOpen={!!openAssign}
        user={openAssign}
        courses={courses}
        onClose={() => setOpenAssign(null)}
        onAssigned={handleAssigned}
      />
      <CreateUserModal
        isOpen={openCreate}
        onClose={() => {
          setOpenCreate(false);
          setUserToEdit(null);
        }}
        defaultValues={createDefaults}
        userToEdit={userToEdit}
        onCreated={(c) => handleProvisioned(c, createDefaults?.pending_id)}
        onUpdated={handleUserUpdated}
      />
    </motion.div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-[10px] font-bold uppercase tracking-wider font-mono-ui`}
    >
      {children}
    </th>
  );
}

function UserRow({
  user,
  index,
  onView,
  onEdit,
  onDeactivate,
  onActivate,
  onAssign,
}) {
  const role = ROLE_TONE[user.role] ?? ROLE_TONE.student;
  const initial = user.name?.charAt(0).toUpperCase() ?? "?";
  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="border-b border-[var(--border-color)] last:border-b-0 transition-colors hover:bg-[var(--bg-secondary)]/50"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: role.color }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text-primary)]">
              {user.name}
            </p>
            {user.role === "student" ? (
              user.email && (
                <p className="truncate text-xs text-[var(--text-muted)] font-mono-ui">
                  {user.email}
                </p>
              )
            ) : (
              <p className="truncate text-xs text-[var(--text-muted)] font-mono-ui">
                {user.email}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
          style={{ color: role.color, backgroundColor: role.bg }}
        >
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        {user.role === "student" && user.admission_no ? (
          <span className="font-mono text-xs font-semibold text-[#10B981]">
            {user.admission_no}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)] font-mono-ui">
            {user.email || "—"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold font-mono-ui">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: user.status === "active" ? "#10B981" : "#EF4444",
            }}
          />
          <span
            style={{
              color: user.status === "active" ? "#10B981" : "#EF4444",
            }}
          >
            {user.status === "active" ? "Active" : "Inactive"}
          </span>
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--text-muted)] font-mono-ui">
        {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <IconButton onClick={onView} title="View details">
            <Eye className="h-4 w-4" />
          </IconButton>
          <IconButton onClick={onEdit} title="Edit user">
            <Pencil className="h-4 w-4" />
          </IconButton>
          {user.role === "instructor" && (
            <IconButton onClick={onAssign} title="Assign to course">
              <BookOpen className="h-4 w-4" />
            </IconButton>
          )}
          {user.status === "active" ? (
            <IconButton
              onClick={onDeactivate}
              title="Deactivate"
              className="text-red-500 hover:bg-red-500/10"
            >
              <Ban className="h-4 w-4" />
            </IconButton>
          ) : (
            <IconButton
              onClick={onActivate}
              title="Activate"
              className="text-[#10B981] hover:bg-[#10B981]/10"
            >
              <CheckCircle className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

function IconButton({ children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PendingList({ items, onProvision }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
        No pending enrollments.
      </div>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((p) => (
        <li
          key={p.id}
          className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                {p.child_name}
              </p>
              <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
                Age {p.age} · {p.programme_track}
              </p>
            </div>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono-ui">
              Pending
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] font-mono-ui">
            {p.parent_name} · {p.parent_email}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
            Requested{" "}
            {formatDistanceToNow(new Date(p.requested_at), { addSuffix: true })}
          </p>
          <button
            type="button"
            onClick={() => onProvision(p)}
            className="mt-1 self-start rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            Create Account →
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Users className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        No users match your search.
      </p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
      >
        Refresh page
      </button>
    </div>
  );
}
