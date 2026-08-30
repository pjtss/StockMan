import fs from "node:fs";
import { describe, expect, it } from "vitest";
const envFile = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const envLine = envFile.split(/\r?\n/).find((value) => /^DATABASE_URL\s*=/.test(value));
if (envLine) process.env.DATABASE_URL = envLine.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^\"|\"$/g, "");
const { getPool } = await import("./db");
const { toggleLike } = await import("./inquiries");

describe.skipIf(!envLine)("inquiry PostgreSQL integration", () => {
  it("serializes concurrent likes for the same user", async () => {
    const pool = getPool();
    const created = await pool.query("INSERT INTO inquiries(title,content,author_key,ip_address) VALUES('integration','integration','integration','127.0.0.1') RETURNING id");
    const id = Number(created.rows[0].id);
    try {
      const results = await Promise.all([toggleLike(id, "concurrent-user"), toggleLike(id, "concurrent-user")]);
      const row = await pool.query("SELECT like_count FROM inquiries WHERE id=$1", [id]);
      expect(results).toHaveLength(2);
      expect(row.rows[0].like_count).toBe(0);
    } finally { await pool.query("DELETE FROM inquiries WHERE id=$1", [id]); await pool.end(); }
  }, 30000);
});
