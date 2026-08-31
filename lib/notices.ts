import { getPool } from "@/lib/db";
import { validateInquiryInput } from "@/lib/inquiry-validation";

export async function listNotices(limit = 30, offset = 0) {
  const result = await getPool().query(`SELECT id, title, author_key, published_at, updated_at FROM notices WHERE is_published = true ORDER BY published_at DESC LIMIT $1 OFFSET $2`, [Math.min(limit, 100), Math.max(offset, 0)]);
  return result.rows;
}

export async function getNotice(id: number) {
  const result = await getPool().query(`SELECT id, title, content, author_key, published_at, updated_at FROM notices WHERE id=$1 AND is_published = true`, [id]);
  return result.rows[0] ?? null;
}

export async function createNotice(title: string, content: string) {
  const input = validateInquiryInput(title, content);
  if (!input.ok) throw new Error(input.error);
  const result = await getPool().query("INSERT INTO notices(title,content) VALUES($1,$2) RETURNING id", [input.title, input.content]);
  return Number(result.rows[0].id);
}
