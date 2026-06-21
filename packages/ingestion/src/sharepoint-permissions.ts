/**
 * -------------------------------------------------------
 * SharePoint Permissions → Criticality Mapping
 * Étape 24 — Phase 6: Connecteur SharePoint
 * Ref: section 7.3 du cahier des charges
 *
 * Maps SharePoint permission roles to the QMS
 * criticality_level scale (low / medium / high).
 *
 * Default mapping:
 *   - read / viewer            → low
 *   - write / contributor / member → medium
 *   - owner / admin / full control → high
 *
 * The mapping is configurable via the SHAREPOINT_CRITICALITY_MAP
 * environment variable (JSON format).
 * -------------------------------------------------------
 */

import type { SharePointPermission } from './sharepoint-connector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CriticalityLevel = 'low' | 'medium' | 'high';

export interface CriticalityMapConfig {
  /** SharePoint roles that map to LOW criticality */
  low: string[];
  /** SharePoint roles that map to MEDIUM criticality */
  medium: string[];
  /** SharePoint roles that map to HIGH criticality */
  high: string[];
}

// ---------------------------------------------------------------------------
// Default mapping
// ---------------------------------------------------------------------------

const DEFAULT_CRITICALITY_MAP: CriticalityMapConfig = {
  low: ['read', 'viewer', 'restricted view', 'limited access'],
  medium: ['write', 'contribute', 'contributor', 'member', 'edit'],
  high: ['owner', 'full control', 'admin', 'design', 'manage hierarchy'],
};

/**
 * Load the criticality mapping from environment or use defaults.
 *
 * SHAREPOINT_CRITICALITY_MAP should be a JSON string like:
 * {"low":["read"],"medium":["write","contribute"],"high":["owner","full control"]}
 */
export function loadCriticalityMap(): CriticalityMapConfig {
  const envMap = process.env.SHAREPOINT_CRITICALITY_MAP;

  if (envMap) {
    try {
      const parsed = JSON.parse(envMap) as Partial<CriticalityMapConfig>;

      return {
        low: parsed.low ?? DEFAULT_CRITICALITY_MAP.low,
        medium: parsed.medium ?? DEFAULT_CRITICALITY_MAP.medium,
        high: parsed.high ?? DEFAULT_CRITICALITY_MAP.high,
      };
    } catch {
      console.warn(
        '[SharePoint] Invalid SHAREPOINT_CRITICALITY_MAP JSON, using defaults.',
      );
    }
  }

  return DEFAULT_CRITICALITY_MAP;
}

/**
 * Map a set of SharePoint permissions to a QMS criticality_level.
 *
 * Strategy:
 *   - Extract all role names from all permission entries
 *   - Find the HIGHEST matching criticality (high > medium > low)
 *   - If no match is found, default to 'low'
 *
 * This follows the principle that if a document has high-level
 * permissions (owner/admin), it's likely more sensitive.
 */
export function mapPermissionsToCriticality(
  permissions: SharePointPermission[],
): CriticalityLevel {
  const critMap = loadCriticalityMap();

  // Collect all role strings (lowercased) from all permission entries
  const allRoles: string[] = [];
  for (const perm of permissions) {
    for (const role of perm.roles) {
      allRoles.push(role.toLowerCase().trim());
    }
  }

  if (allRoles.length === 0) {
    return 'low'; // Default when no permissions are accessible
  }

  // Check from highest to lowest
  const hasHigh = allRoles.some((role) =>
    critMap.high.some((mapRole) => role.includes(mapRole.toLowerCase())),
  );
  if (hasHigh) return 'high';

  const hasMedium = allRoles.some((role) =>
    critMap.medium.some((mapRole) => role.includes(mapRole.toLowerCase())),
  );
  if (hasMedium) return 'medium';

  return 'low';
}

/**
 * Get a human-readable description of the mapping for display in admin UI.
 */
export function getCriticalityMapDescription(): {
  map: CriticalityMapConfig;
  description: string;
} {
  const map = loadCriticalityMap();

  const description = [
    `LOW  ← SharePoint roles: ${map.low.join(', ')}`,
    `MEDIUM ← SharePoint roles: ${map.medium.join(', ')}`,
    `HIGH ← SharePoint roles: ${map.high.join(', ')}`,
  ].join('\n');

  return { map, description };
}
