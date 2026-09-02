import { getPool } from "./db";
import { getCurrentUser } from "./user-auth";

export type WatchlistMarket = "KR" | "US";
export type UserWatchlistItem = { market: WatchlistMarket; code: string; createdAt: string };

export async function getUserWatchlist() {
  const user = await getCurrentUser();
  if (!user) return null;
  const result = await getPool().query("SELECT market, code, created_at FROM user_watchlist WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
  return result.rows.map(row => ({ market: row.market as WatchlistMarket, code: row.code, createdAt: new Date(row.created_at).toISOString() }));
}

export async function addUserWatchlistItem(market: WatchlistMarket, code: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const result = await getPool().query("INSERT INTO user_watchlist(user_id,market,code) VALUES($1,$2,$3) ON CONFLICT (user_id,market,code) DO UPDATE SET code=EXCLUDED.code RETURNING market,code,created_at", [user.id, market, code]);
  return result.rows[0];
}

export async function removeUserWatchlistItem(market: WatchlistMarket, code: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  await getPool().query("DELETE FROM user_watchlist WHERE user_id=$1 AND market=$2 AND code=$3", [user.id, market, code]);
  return true;
}
