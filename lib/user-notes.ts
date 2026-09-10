import { getPool } from "./db";
import { getCurrentUser } from "./user-auth";

export type UserNote = { id: number; title: string; content: string; createdAt: string; updatedAt: string };
const map = (row: any): UserNote => ({ id: Number(row.id), title: row.title, content: row.content, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() });
export async function listUserNotes() { const user = await getCurrentUser(); if (!user) return null; const result = await getPool().query("SELECT id,title,content,created_at,updated_at FROM user_notes WHERE user_id=$1 ORDER BY updated_at DESC", [user.id]); return result.rows.map(map); }
export async function createUserNote(title: string, content: string) { const user = await getCurrentUser(); if (!user) return null; const result = await getPool().query("INSERT INTO user_notes(user_id,title,content) VALUES($1,$2,$3) RETURNING id,title,content,created_at,updated_at", [user.id,title,content]); return map(result.rows[0]); }
export async function updateUserNote(id: number, title: string, content: string) { const user = await getCurrentUser(); if (!user) return null; const result = await getPool().query("UPDATE user_notes SET title=$1,content=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING id,title,content,created_at,updated_at", [title,content,id,user.id]); return result.rows[0] ? map(result.rows[0]) : undefined; }
export async function deleteUserNote(id: number) { const user = await getCurrentUser(); if (!user) return null; const result = await getPool().query("DELETE FROM user_notes WHERE id=$1 AND user_id=$2", [id,user.id]); return result.rowCount === 1; }
