'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type AppRole = 'admin' | 'user';
type CriticalityLevel = 'low' | 'medium' | 'high';

interface UserAccount {
  id: string;
  name: string;
  email: string | null;
  role: AppRole;
  criticality_level: CriticalityLevel;
  created_at: string | null;
}

// ─── Badge helpers ───────────────────────────────────────────────────────────
const criticalityColors: Record<CriticalityLevel, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium:
    'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

const roleColors: Record<AppRole, string> = {
  admin:
    'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
  user: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
};

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

// ─── Change Dialog ───────────────────────────────────────────────────────────
function ChangeCriticalityDialog({
  targetUser,
  currentAdminId,
  onClose,
  onSaved,
}: {
  targetUser: UserAccount;
  currentAdminId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<CriticalityLevel>(
    targetUser.criticality_level,
  );
  const [confirmed, setConfirmed] = useState(false);

  const isSelf = targetUser.id === currentAdminId;
  const isChangingAdmin = targetUser.role === 'admin';

  const handleSubmit = () => {
    setError(null);

    if (isSelf && !confirmed) {
      setError('Please confirm you want to change your own permissions.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${targetUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ criticality_level: newLevel }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Update failed');
          return;
        }
        onSaved();
      } catch {
        setError('Network error');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Change Criticality Level</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-muted/40 p-3">
          <p className="text-sm">
            <span className="font-medium">{targetUser.name}</span>
            <br />
            <span className="text-muted-foreground">
              {targetUser.email}
            </span>
          </p>
        </div>

        {(isSelf || isChangingAdmin) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {isSelf
                ? 'Warning: You are modifying your own account.'
                : 'Warning: You are modifying another admin account.'}
            </p>
          </div>
        )}

        <div className="mb-5 space-y-2">
          <label className="text-sm font-medium">New Criticality Level</label>
          <div className="flex gap-3">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setNewLevel(level)}
                className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider transition-all ${
                  newLevel === level
                    ? `${criticalityColors[level]} border-current shadow-sm`
                    : 'border-border/40 text-muted-foreground hover:border-border'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {isSelf && (
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-border"
            />
            I confirm I want to change my own permissions
          </label>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || newLevel === targetUser.criticality_level}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply Change
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
        // Find the admin user to know self
        const adminUser = data.users?.find(
          (u: UserAccount) => u.role === 'admin',
        );
        if (adminUser) setCurrentAdminId(adminUser.id);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = users.filter(
    (u) =>
      (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage user roles and document criticality clearance levels.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-5">
        {[
          {
            label: 'Total Users',
            value: users.length,
            icon: Users,
            color: 'text-foreground',
          },
          {
            label: 'Admins',
            value: users.filter((u) => u.role === 'admin').length,
            icon: Shield,
            color: 'text-violet-600 dark:text-violet-400',
          },
          {
            label: 'LOW',
            value: users.filter((u) => u.criticality_level === 'low').length,
            color: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'MEDIUM',
            value: users.filter((u) => u.criticality_level === 'medium')
              .length,
            color: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'HIGH',
            value: users.filter((u) => u.criticality_level === 'high').length,
            color: 'text-rose-600 dark:text-rose-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/40 bg-card/50 p-4 shadow-sm backdrop-blur-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search users by name or email…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Criticality Level
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2">Loading users…</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Users className="mx-auto h-8 w-8 opacity-40" />
                    <p className="mt-2 font-medium">No users found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/20 transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.role === 'admin' && (
                          <Shield className="h-4 w-4 text-violet-500" />
                        )}
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.email || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={roleColors[user.role]}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={criticalityColors[user.criticality_level]}>
                        {user.criticality_level}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        Change Level
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change dialog */}
      {editingUser && (
        <ChangeCriticalityDialog
          targetUser={editingUser}
          currentAdminId={currentAdminId}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
