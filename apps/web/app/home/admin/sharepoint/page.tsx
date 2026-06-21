'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  FolderSync,
  Loader2,
  RefreshCcw,
  Server,
  Shield,
  XCircle,
} from 'lucide-react';

/**
 * -------------------------------------------------------
 * Admin SharePoint Page
 * Étape 24 — Phase 6: Connecteur SharePoint
 *
 * Allows administrators to:
 *   - View SharePoint configuration status
 *   - Test the connection to SharePoint
 *   - Launch manual synchronization
 *   - View sync results and criticality mapping
 *
 * Protected by the admin layout (requireAdmin).
 * -------------------------------------------------------
 */

interface EnvStatus {
  SHAREPOINT_TENANT_ID: boolean;
  SHAREPOINT_CLIENT_ID: boolean;
  SHAREPOINT_CLIENT_SECRET: boolean;
  SHAREPOINT_SITE_ID: boolean;
  SHAREPOINT_DRIVE_ID: boolean;
}

interface ConfigStatus {
  configured: boolean;
  syncedDocuments: number;
  criticalityMap: {
    low: string[];
    medium: string[];
    high: string[];
  };
  criticalityDescription: string;
  envStatus: EnvStatus;
}

interface SyncResult {
  totalFiles: number;
  newFiles: number;
  updatedFiles: number;
  skippedFiles: number;
  errors: Array<{ fileName: string; error: string }>;
}

export default function SharePointAdminPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    fileCount?: number;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load configuration status ──────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sharepoint/config');
      const data = await res.json();
      if (res.ok) {
        setConfig(data as ConfigStatus);
      } else {
        setError(data.error || 'Failed to load configuration');
      }
    } catch {
      setError('Network error loading configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Test connection ────────────────────────────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/sharepoint/config', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection test failed',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network error during connection test',
      });
    } finally {
      setTesting(false);
    }
  }, []);

  // ── Launch sync ────────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/sharepoint/sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setSyncResult(data.result as SyncResult);
        // Refresh config to update document count
        loadConfig();
      } else {
        setError(data.error || 'Synchronization failed');
      }
    } catch {
      setError('Network error during synchronization');
    } finally {
      setSyncing(false);
    }
  }, [loadConfig]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-sm">
          <Cloud className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">SharePoint Integration</h1>
          <p className="text-sm text-muted-foreground">
            Connect and synchronize your SharePoint document library
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Configuration status */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Configuration Status</h2>
          <div className="flex-1" />
          {config?.configured ? (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Check className="h-3 w-3" />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              <AlertCircle className="h-3 w-3" />
              Not configured
            </span>
          )}
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">
            Set these environment variables in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              .env.local
            </code>{' '}
            to enable SharePoint integration:
          </p>

          <div className="grid gap-1.5">
            {config?.envStatus &&
              Object.entries(config.envStatus).map(([key, isSet]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5"
                >
                  {isSet ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <code className="text-xs">{key}</code>
                  <span className="text-[10px] text-muted-foreground">
                    {isSet ? '✓ Set' : '✗ Missing'}
                  </span>
                </div>
              ))}
          </div>

          {config && (
            <p className="text-xs text-muted-foreground">
              Synced documents:{' '}
              <span className="font-semibold text-foreground">
                {config.syncedDocuments}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Connection test */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Connection Test</h2>
        </div>

        <div className="space-y-3 p-5">
          <button
            onClick={handleTestConnection}
            disabled={testing || !config?.configured}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4" />
                Test Connection
              </>
            )}
          </button>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                testResult.success
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p>{testResult.message}</p>
                {testResult.fileCount !== undefined && (
                  <p className="mt-1 text-xs opacity-80">
                    Files found in library: {testResult.fileCount}
                  </p>
                )}
              </div>
            </div>
          )}

          {!config?.configured && (
            <p className="text-xs text-muted-foreground">
              Configure all environment variables above before testing the
              connection.
            </p>
          )}
        </div>
      </div>

      {/* Synchronization */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <FolderSync className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Document Synchronization</h2>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">
            Download new and updated files from SharePoint, extract text,
            generate embeddings, and ingest into the QMS document base with{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              source=&apos;sharepoint&apos;
            </code>
            .
          </p>

          <button
            onClick={handleSync}
            disabled={syncing || !config?.configured}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Synchronizing…
              </>
            ) : (
              <>
                <FolderSync className="h-4 w-4" />
                Sync Now
              </>
            )}
          </button>

          {/* Sync results */}
          {syncResult && (
            <div className="space-y-2 rounded-lg border border-border/30 bg-muted/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sync Results
              </h3>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ResultCard
                  label="Total Files"
                  value={syncResult.totalFiles}
                />
                <ResultCard
                  label="New"
                  value={syncResult.newFiles}
                  color="green"
                />
                <ResultCard
                  label="Updated"
                  value={syncResult.updatedFiles}
                  color="blue"
                />
                <ResultCard
                  label="Skipped"
                  value={syncResult.skippedFiles}
                  color="gray"
                />
              </div>

              {syncResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-red-500">
                    Errors ({syncResult.errors.length}):
                  </p>
                  {syncResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                    >
                      <span className="font-medium">{err.fileName}:</span>{' '}
                      {err.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Criticality mapping reference */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            Permission → Criticality Mapping
          </h2>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">
            SharePoint permissions are mapped to QMS criticality levels. This
            mapping can be customized via the{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              SHAREPOINT_CRITICALITY_MAP
            </code>{' '}
            environment variable (JSON format).
          </p>

          {config?.criticalityMap && (
            <div className="space-y-2">
              <MappingRow
                level="LOW"
                color="green"
                roles={config.criticalityMap.low}
              />
              <MappingRow
                level="MEDIUM"
                color="yellow"
                roles={config.criticalityMap.medium}
              />
              <MappingRow
                level="HIGH"
                color="red"
                roles={config.criticalityMap.high}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: 'green' | 'blue' | 'gray';
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-600 dark:text-green-400'
      : color === 'blue'
        ? 'text-blue-600 dark:text-blue-400'
        : color === 'gray'
          ? 'text-muted-foreground'
          : 'text-foreground';

  return (
    <div className="rounded-lg bg-background p-2.5 text-center">
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MappingRow({
  level,
  color,
  roles,
}: {
  level: string;
  color: 'green' | 'yellow' | 'red';
  roles: string[];
}) {
  const badgeColor =
    color === 'green'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : color === 'yellow'
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeColor}`}
      >
        {level}
      </span>
      <span className="text-xs text-muted-foreground">←</span>
      <div className="flex flex-wrap gap-1">
        {roles.map((role) => (
          <span
            key={role}
            className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground/70"
          >
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}
