'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Loader2,
  Search,
  Shield,
  Upload,
  User,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  action: string;
  document_id: string | null;
  query: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Action badge colors ─────────────────────────────────────────────────────
const actionConfig: Record<
  string,
  { label: string; color: string; icon: typeof Shield }
> = {
  document_upload: {
    label: 'Upload',
    color:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    icon: Upload,
  },
  document_edit: {
    label: 'Edit',
    color:
      'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
    icon: FileText,
  },
  role_change: {
    label: 'Role Change',
    color:
      'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
    icon: Shield,
  },
  search: {
    label: 'Search',
    color:
      'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
    icon: Search,
  },
  document_view: {
    label: 'View',
    color:
      'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
    icon: FileText,
  },
  ingestion: {
    label: 'Ingestion',
    color:
      'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    icon: Upload,
  },
};

function getActionConfig(action: string) {
  return (
    actionConfig[action] || {
      label: action,
      color:
        'bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30',
      icon: AlertTriangle,
    }
  );
}

function ActionBadge({ action }: { action: string }) {
  const config = getActionConfig(action);
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wider ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ─── Filter Panel ────────────────────────────────────────────────────────────
function FilterPanel({
  actionFilter,
  setActionFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onClose,
}: {
  actionFilter: string;
  setActionFilter: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  onClose: () => void;
}) {
  const actionOptions = [
    { value: '', label: 'All Actions' },
    { value: 'document_upload', label: 'Document Upload' },
    { value: 'document_edit', label: 'Document Edit' },
    { value: 'role_change', label: 'Role Change' },
    { value: 'search', label: 'Search' },
    { value: 'document_view', label: 'Document View' },
    { value: 'ingestion', label: 'Ingestion' },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4" />
          Filters
        </h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Action type filter */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Action Type
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            From Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Date to */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            To Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* Active filter indicator */}
      {(actionFilter || fromDate || toDate) && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Active:</span>
          {actionFilter && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {actionOptions.find((o) => o.value === actionFilter)?.label}
              <button
                onClick={() => setActionFilter('')}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {fromDate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              From: {fromDate}
              <button
                onClick={() => setFromDate('')}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {toDate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              To: {toDate}
              <button
                onClick={() => setToDate('')}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setActionFilter('');
              setFromDate('');
              setToDate('');
            }}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '50');
        params.set('sort', sortDirection);

        if (actionFilter) params.set('action', actionFilter);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        const res = await fetch(`/api/admin/audit?${params.toString()}`);
        const data = await res.json();

        if (res.ok) {
          setLogs(data.logs || []);
          setPagination(
            data.pagination || {
              page: 1,
              limit: 50,
              total: 0,
              totalPages: 0,
            },
          );
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, fromDate, toDate, searchQuery, sortDirection],
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  // Compute stats from current data
  const actionCounts = logs.reduce(
    (acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete log of all administrative actions for compliance and
            traceability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowDownUp className="h-4 w-4" />
            {sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              showFilters || actionFilter || fromDate || toDate
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {(actionFilter || fromDate || toDate) && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold">
                {[actionFilter, fromDate, toDate].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          actionFilter={actionFilter}
          setActionFilter={setActionFilter}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/40 bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Logs
          </p>
          <p className="mt-1 text-2xl font-bold">{pagination.total}</p>
        </div>
        {Object.entries(actionCounts)
          .slice(0, 3)
          .map(([action, count]) => {
            const config = getActionConfig(action);
            return (
              <div
                key={action}
                className="rounded-xl border border-border/40 bg-card/50 p-4 shadow-sm backdrop-blur-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {config.label}
                </p>
                <p className="mt-1 text-2xl font-bold">{count}</p>
              </div>
            );
          })}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search audit logs by description…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Audit logs table */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Timestamp
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    User
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
                <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">
                  Details
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">
                  Document
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2">Loading audit logs…</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Shield className="mx-auto h-8 w-8 opacity-40" />
                    <p className="mt-2 font-medium">No audit logs found</p>
                    <p className="text-xs">
                      {actionFilter || fromDate || toDate || searchQuery
                        ? 'Try adjusting your filters.'
                        : 'Logs will appear here as actions are performed.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border/20 transition-colors hover:bg-muted/20"
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {formatRelativeTime(log.created_at)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(log.created_at)}{' '}
                          {formatTime(log.created_at)}
                        </span>
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{log.user_name}</span>
                        {log.user_email && (
                          <span className="text-xs text-muted-foreground">
                            {log.user_email}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>

                    {/* Details / Query */}
                    <td className="hidden max-w-xs truncate px-4 py-3 text-muted-foreground lg:table-cell">
                      {log.query || '—'}
                    </td>

                    {/* Document ID */}
                    <td className="hidden px-4 py-3 md:table-cell">
                      {log.document_id ? (
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                          {log.document_id.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/50 px-4 py-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            <span className="font-medium text-foreground">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>
            –
            <span className="font-medium text-foreground">
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total,
              )}
            </span>{' '}
            of{' '}
            <span className="font-medium text-foreground">
              {pagination.total}
            </span>{' '}
            logs
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchLogs(pagination.page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="min-w-[3rem] text-center text-sm font-medium">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchLogs(pagination.page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
