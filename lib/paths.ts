/** Build-time prefix for the PolicyEngine multizone; empty for local/offline builds. */
export const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

export const PUBLIC_TOOL_URL =
  "https://www.policyengine.org/us/rent-and-property-taxes";
