import { getPool } from "@/lib/db";

export async function loadUserActivityDashboard(hours = 24, limit = 100, userKey = "") {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 10), 500);
  const pool = getPool();
  const recentQuery = userKey
    ? pool.query('SELECT id, request_id AS "requestId", method, path, status_code AS "statusCode", user_key AS "userKey", ip_address AS ip, user_agent AS "userAgent", geo_country_name AS "country", geo_region AS "region", geo_city AS "city", created_at AS "createdAt" FROM request_logs WHERE user_key=$1 ORDER BY created_at DESC LIMIT $2', [userKey, Math.min(safeLimit, 100)])
    : pool.query('SELECT id, request_id AS "requestId", method, path, status_code AS "statusCode", user_key AS "userKey", ip_address AS ip, user_agent AS "userAgent", geo_country_name AS "country", geo_region AS "region", geo_city AS "city", created_at AS "createdAt" FROM request_logs ORDER BY created_at DESC LIMIT $1', [Math.min(safeLimit, 100)]);
  const [summary, paths, users, recent] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS requests, COUNT(DISTINCT user_key)::int AS users, COUNT(DISTINCT ip_address)::int AS ips, COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour')", [safeHours]),
    pool.query("SELECT path, method, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour') GROUP BY path, method ORDER BY count DESC LIMIT $2", [safeHours, safeLimit]),
    pool.query("SELECT user_key AS \"userKey\", COUNT(*)::int AS count, MAX(created_at) AS \"lastSeen\", MAX(ip_address) AS ip, MAX(user_agent) AS \"userAgent\", MAX(geo_country_name) AS country, MAX(geo_region) AS region, MAX(geo_city) AS city FROM request_logs WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour') GROUP BY user_key ORDER BY \"lastSeen\" DESC LIMIT $2", [safeHours, safeLimit]),
    recentQuery,
  ]);
  return { hours: safeHours, selectedUserKey: userKey || null, summary: summary.rows[0], paths: paths.rows, users: users.rows, recent: recent.rows };
}
