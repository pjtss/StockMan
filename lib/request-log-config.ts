/** Shared by middleware and the collector so tracking is not silently
 * disabled when the optional request-log secret is absent. */
export function getRequestLogSecret() {
  return process.env.REQUEST_LOG_SECRET || process.env.ADMIN_DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD || "";
}
