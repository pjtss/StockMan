import { getPool } from "@/lib/db";

export async function loadUserActivityDashboard(hours = 24, limit = 100) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 10), 500);
  const pool = getPool();
  const [summary, paths, users, recent] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS requests, COUNT(DISTINCT user_key)::int AS users, COUNT(DISTINCT ip_address)::int AS ips, COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour')", [safeHours]),
    pool.query("SELECT path, method, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour') GROUP BY path, method ORDER BY count DESC LIMIT $2", [safeHours, safeLimit]),
    pool.query("SELECT user_key AS \"userKey\", COUNT(*)::int AS count, MAX(created_at) AS \"lastSeen\", MAX(ip_address) AS ip, MAX(user_agent) AS \"userAgent\" FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour') GROUP BY user_key ORDER BY \"lastSeen\" DESC LIMIT $2", [safeHours, safeLimit]),
    pool.query("SELECT id, request_id AS \"requestId\", method, path, status_code AS \"statusCode\", user_key AS \"userKey\", created_at AS \"createdAt\" FROM request_logs ORDER BY created_at DESC LIMIT $1", [Math.min(safeLimit, 100)]),
  ]);
  return { hours: safeHours, summary: summary.rows[0], paths: paths.rows, users: users.rows, recent: recent.rows };
}
