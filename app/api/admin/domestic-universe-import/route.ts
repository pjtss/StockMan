import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { importDomesticInstrumentMasters } from "@/lib/instrument-universe-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const expectedFiles = ["kospi_code.mst", "kosdaq_code.mst"] as const;
const maxFileBytes = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const form = await request.formData();
    const files = form.getAll("files");
    if (files.length !== expectedFiles.length || files.some((file) => typeof file === "string" || !("arrayBuffer" in file))) {
      return NextResponse.json({ ok: false, error: "DOMESTIC_MASTER_FILES_REQUIRED", expectedFiles }, { status: 400 });
    }
    const uploaded = files as File[];
    const normalizedNames = uploaded.map((file) => file.name.toLowerCase());
    if (expectedFiles.some((name) => !normalizedNames.includes(name)) || new Set(normalizedNames).size !== expectedFiles.length) {
      return NextResponse.json({ ok: false, error: "DOMESTIC_MASTER_FILES_REQUIRED", expectedFiles }, { status: 400 });
    }
    if (uploaded.some((file) => file.size === 0 || file.size > maxFileBytes)) {
      return NextResponse.json({ ok: false, error: "DOMESTIC_MASTER_FILE_SIZE_INVALID", maxFileBytes }, { status: 413 });
    }
    const result = await importDomesticInstrumentMasters(await Promise.all(uploaded.map(async (file) => ({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }))));
    return NextResponse.json({ ...result, uploadedFiles: uploaded.map((file) => file.name) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message === "DOMESTIC_MASTER_INCOMPLETE" || message.startsWith("DOMESTIC_MASTER_FILES_REQUIRED:") ? 400 : 502;
    console.error("[domestic-universe-import] failed", message.slice(0, 300));
    return NextResponse.json({ ok: false, error: status === 400 ? message.split(":")[0] : "DOMESTIC_UNIVERSE_IMPORT_FAILED" }, { status });
  }
}
