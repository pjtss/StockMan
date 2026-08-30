import { getPool } from "@/lib/db";

export async function listInquiries(limit = 30, offset = 0) {
  const result = await getPool().query(`SELECT i.id, i.title, i.author_key, i.ip_address, i.user_agent, i.view_count, i.like_count, i.created_at, COUNT(c.id)::int AS comment_count FROM inquiries i LEFT JOIN inquiry_comments c ON c.inquiry_id=i.id GROUP BY i.id ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`, [Math.min(limit, 100), Math.max(offset, 0)]);
  return result.rows;
}

export async function getInquiry(id: number) {
  const [inquiry, comments] = await Promise.all([
    getPool().query(`SELECT id,title,content,author_key,ip_address,user_agent,view_count,like_count,created_at FROM inquiries WHERE id=$1`, [id]),
    getPool().query(`SELECT id,content,author_key,ip_address,user_agent,created_at FROM inquiry_comments WHERE inquiry_id=$1 ORDER BY created_at ASC`, [id]),
  ]);
  return inquiry.rows[0] ? { ...inquiry.rows[0], comments: comments.rows } : null;
}

export async function incrementView(id: number) { await getPool().query("UPDATE inquiries SET view_count=view_count+1 WHERE id=$1", [id]); }
export async function createInquiry(title: string, content: string, identity: { userKey: string; ip: string; userAgent: string }) { const r = await getPool().query(`INSERT INTO inquiries(title,content,author_key,ip_address,user_agent) VALUES($1,$2,$3,$4,$5) RETURNING id`, [title,content,identity.userKey,identity.ip,identity.userAgent]); return r.rows[0].id as number; }
export async function createComment(id: number, content: string, identity: { userKey: string; ip: string; userAgent: string }) { await getPool().query(`INSERT INTO inquiry_comments(inquiry_id,content,author_key,ip_address,user_agent) VALUES($1,$2,$3,$4,$5)`, [id,content,identity.userKey,identity.ip,identity.userAgent]); }
export async function addLike(id: number, identity: { userKey: string; ip: string; userAgent: string }) { await getPool().query("INSERT INTO inquiry_likes(inquiry_id,user_key,ip_address,user_agent) VALUES($1,$2,$3,$4)",[id,identity.userKey,identity.ip,identity.userAgent]); const result=await getPool().query("UPDATE inquiries SET like_count=like_count+1 WHERE id=$1 RETURNING like_count",[id]); return Number(result.rows[0]?.like_count ?? 0); }
