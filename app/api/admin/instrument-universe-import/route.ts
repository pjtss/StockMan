import { NextResponse } from "next/server";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireAdminSession } from "@/lib/admin-auth";
import { importInstrumentMasters } from "@/lib/instrument-universe-import";

export async function POST(request: Request) {
  try {
    if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const required = ["kospi_code.mst", "kosdaq_code.mst", "NASMST.COD", "NYSMST.COD", "AMSMST.COD"];
      const files = new Map<string, File>();
      for (const [fieldName, value] of form.entries()) {
        if (!(value instanceof File) || value.size <= 0) continue;
        const safeName = path.basename(value.name || fieldName);
        if (safeName !== value.name && safeName !== fieldName) continue;
        files.set(safeName, value);
      }
      const missing = required.filter((name) => !files.has(name));
      if (missing.length) return NextResponse.json({ ok: false, error: "필수 마스터 파일이 누락되었습니다.", missingFiles: missing }, { status: 400 });
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "stockman-instrument-master-"));
      for (const name of required) {
        const file = files.get(name);
        if (file) await writeFile(path.join(tempDirectory, name), Buffer.from(await file.arrayBuffer()));
      }
      return NextResponse.json({ ...(await importInstrumentMasters(tempDirectory)), uploadMode: true, uploadedFiles: required });
    }
    const body = await request.json().catch(() => ({}));
    const sourceDirectory = String(body.sourceDirectory || process.env.INSTRUMENT_MASTER_DIR || "").trim();
    if (!sourceDirectory) return NextResponse.json({ ok: false, error: "파일을 multipart로 업로드하거나 sourceDirectory를 지정해야 합니다." }, { status: 400 });
    return NextResponse.json({ ...(await importInstrumentMasters(sourceDirectory)), uploadMode: false });
  } catch (error) {
    console.error("[instrument-universe-import] failed", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "INSTRUMENT_UNIVERSE_IMPORT_FAILED" }, { status: 502 });
  }
}

export const GET = POST;
