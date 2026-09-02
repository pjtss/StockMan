import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "./db";

const COOKIE = "stockman_session";
const TTL = 24 * 60 * 60 * 1000;
const secure = () => process.env.NODE_ENV === "production" || process.env.AUTH_COOKIE_SECURE === "true";
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const passwordHash = (password: string, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
const passwordMatches = (password: string, stored: string) => { const [salt, value] = stored.split(":"); if (!salt || !value) return false; const actual = crypto.scryptSync(password, salt, 64); const expected = Buffer.from(value, "hex"); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); };
export function validateUsername(value: string) { return /^[A-Za-z0-9_]{3,32}$/.test(value); }
export function validatePassword(value: string) { return value.length >= 8 && value.length <= 128; }
function cookie(value: string, maxAge: number) { return { name: COOKIE, value, options: { httpOnly: true, sameSite: "lax" as const, secure: secure(), path: "/", maxAge } }; }
export function clearUserSessionCookie() { return cookie("", 0); }
export async function logoutUser() { const token=(await cookies()).get(COOKIE)?.value; if(token) await getPool().query("UPDATE user_sessions SET revoked_at=NOW() WHERE session_hash=$1 AND revoked_at IS NULL",[hashToken(token)]); }
export async function registerUser(username: string, password: string) { if (!validateUsername(username) || !validatePassword(password)) throw new Error("INVALID_CREDENTIALS"); const pool=getPool(); const result=await pool.query("INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username",[username,passwordHash(password)]).catch((e:any)=>{if(e?.code==="23505")throw new Error("USERNAME_TAKEN");throw e}); return result.rows[0]; }
export async function loginUser(username: string, password: string, ip?: string|null, userAgent?: string|null) { const pool=getPool(); const client=await pool.connect(); try { await client.query("BEGIN"); const result=await client.query("SELECT id,username,password_hash FROM users WHERE username=$1 AND status='ACTIVE'",[username]); if(!result.rowCount || !passwordMatches(password,result.rows[0].password_hash)) throw new Error("INVALID_LOGIN"); const token=crypto.randomBytes(32).toString("base64url"), now=Date.now(), expires=new Date(now+TTL); await client.query("UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW()",[result.rows[0].id]); await client.query("INSERT INTO user_sessions(user_id,session_hash,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5)",[result.rows[0].id,hashToken(token),expires,ip??null,userAgent??null]); await client.query("UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1",[result.rows[0].id]); await client.query("COMMIT"); return { user:{id:result.rows[0].id,username:result.rows[0].username}, cookie:cookie(token,TTL/1000) }; } catch(e){await client.query("ROLLBACK");throw e} finally{client.release()} }
export async function getCurrentUser() { const token=(await cookies()).get(COOKIE)?.value; if(!token)return null; const result=await getPool().query("SELECT u.id,u.username,s.expires_at FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.session_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE'",[hashToken(token)]); return result.rows[0]??null; }
export async function requireUserSession() { return getCurrentUser(); }
export { COOKIE as USER_SESSION_COOKIE };
