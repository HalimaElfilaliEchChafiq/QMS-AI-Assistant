/**
 * -------------------------------------------------------
 * SharePoint Connector — Microsoft Graph API Client
 * Étape 24 — Phase 6: Connecteur SharePoint
 * Ref: section 7.3 du cahier des charges
 *
 * Authenticates via OAuth2 client_credentials flow and
 * provides methods to:
 *   - List files in a SharePoint document library
 *   - Download file content
 *   - Retrieve file permissions
 *   - Track file versions for delta sync
 *
 * All credentials come from environment variables.
 * -------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
}

export interface SharePointDriveItem {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  lastModifiedDateTime: string;
  createdDateTime: string;
  file?: {
    mimeType: string;
    hashes?: {
      sha256Hash?: string;
    };
  };
  folder?: {
    childCount: number;
  };
  /** The eTag is used for change detection (delta sync) */
  eTag?: string;
  /** Extracted from path or metadata */
  parentPath?: string;
}

export interface SharePointPermission {
  id: string;
  roles: string[]; // e.g. ['read'], ['write'], ['owner']
  grantedToV2?: {
    user?: { displayName: string; email?: string };
    group?: { displayName: string };
    siteGroup?: { displayName: string };
  };
  grantedTo?: {
    user?: { displayName: string; email?: string };
  };
}

export interface SharePointSyncResult {
  totalFiles: number;
  newFiles: number;
  updatedFiles: number;
  skippedFiles: number;
  errors: Array<{ fileName: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Configuration loader
// ---------------------------------------------------------------------------

export function loadSharePointConfig(): SharePointConfig {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;

  if (!tenantId || !clientId || !clientSecret || !siteId || !driveId) {
    throw new Error(
      'SharePoint configuration incomplete. Required env vars: ' +
        'SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, ' +
        'SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID',
    );
  }

  return { tenantId, clientId, clientSecret, siteId, driveId };
}

/**
 * Check if SharePoint integration is configured (all env vars present).
 */
export function isSharePointConfigured(): boolean {
  return !!(
    process.env.SHAREPOINT_TENANT_ID &&
    process.env.SHAREPOINT_CLIENT_ID &&
    process.env.SHAREPOINT_CLIENT_SECRET &&
    process.env.SHAREPOINT_SITE_ID &&
    process.env.SHAREPOINT_DRIVE_ID
  );
}

// ---------------------------------------------------------------------------
// OAuth2 Token
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getAccessToken(
  config: SharePointConfig,
): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SharePoint OAuth2 token request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// ---------------------------------------------------------------------------
// Microsoft Graph API calls
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * List all files in the SharePoint document library drive.
 * Recursively fetches children of the root folder.
 */
export async function listDriveItems(
  config: SharePointConfig,
): Promise<SharePointDriveItem[]> {
  const token = await getAccessToken(config);
  const items: SharePointDriveItem[] = [];

  let url: string | null =
    `${GRAPH_BASE}/sites/${config.siteId}/drives/${config.driveId}/root/children?$top=200&$select=id,name,webUrl,size,lastModifiedDateTime,createdDateTime,file,folder,eTag,parentReference`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `SharePoint listDriveItems failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      value: SharePointDriveItem[];
      '@odata.nextLink'?: string;
    };

    // Only add files (not folders) to the list
    for (const item of data.value) {
      if (item.file) {
        items.push(item);
      }
    }

    url = data['@odata.nextLink'] || null;
  }

  return items;
}

/**
 * Download file content as a Buffer.
 */
export async function downloadFile(
  config: SharePointConfig,
  itemId: string,
): Promise<Buffer> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `${GRAPH_BASE}/sites/${config.siteId}/drives/${config.driveId}/items/${itemId}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SharePoint downloadFile failed (${response.status}): ${body}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get permissions for a specific drive item.
 */
export async function getFilePermissions(
  config: SharePointConfig,
  itemId: string,
): Promise<SharePointPermission[]> {
  const token = await getAccessToken(config);

  const response = await fetch(
    `${GRAPH_BASE}/sites/${config.siteId}/drives/${config.driveId}/items/${itemId}/permissions`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    // Permissions may not be accessible for all items
    console.warn(
      `[SharePoint] Could not fetch permissions for item ${itemId}`,
    );
    return [];
  }

  const data = (await response.json()) as {
    value: SharePointPermission[];
  };

  return data.value;
}

/**
 * Test the SharePoint connection by attempting to list the drive root.
 */
export async function testConnection(
  config: SharePointConfig,
): Promise<{ success: boolean; message: string; fileCount?: number }> {
  try {
    const token = await getAccessToken(config);

    const response = await fetch(
      `${GRAPH_BASE}/sites/${config.siteId}/drives/${config.driveId}/root`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        message: `Connection test failed (${response.status}): ${body}`,
      };
    }

    // Count files
    const items = await listDriveItems(config);

    return {
      success: true,
      message: 'Connected successfully to SharePoint.',
      fileCount: items.length,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message };
  }
}
