import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function detectRepeatHalves(value: string) {
  if (value.length % 2 !== 0 || value.length === 0) return false;
  const half = value.length / 2;
  return value.slice(0, half) === value.slice(half);
}

function parseEnvText(text: string) {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runtime = {
    KIS_APPKEY: process.env.KIS_APPKEY ?? "",
    KIS_APPSECRET: process.env.KIS_APPSECRET ?? "",
  };

  let fileEnv: Record<string, string> = {};
  try {
    const text = await readFile(".env.local", "utf8");
    fileEnv = parseEnvText(text);
  } catch (error) {
    console.warn("[KIS-ENV-DEBUG] failed to read .env.local:", error);
  }

  const file = {
    KIS_APPKEY: fileEnv.KIS_APPKEY ?? "",
    KIS_APPSECRET: fileEnv.KIS_APPSECRET ?? "",
  };

  const compare = {
    KIS_APPKEY: runtime.KIS_APPKEY === file.KIS_APPKEY,
    KIS_APPSECRET: runtime.KIS_APPSECRET === file.KIS_APPSECRET,
  };
  const repeatCheck = {
    KIS_APPKEY: detectRepeatHalves(runtime.KIS_APPKEY),
    KIS_APPSECRET: detectRepeatHalves(runtime.KIS_APPSECRET),
  };

  console.info("[KIS-ENV-DEBUG] runtime env:", {
    KIS_APPKEY: mask(runtime.KIS_APPKEY),
    KIS_APPSECRET: mask(runtime.KIS_APPSECRET),
  });
  console.info("[KIS-ENV-DEBUG] file env:", {
    KIS_APPKEY: mask(file.KIS_APPKEY),
    KIS_APPSECRET: mask(file.KIS_APPSECRET),
  });
  console.info("[KIS-ENV-DEBUG] compare:", compare);
  console.info("[KIS-ENV-DEBUG] repeatCheck:", repeatCheck);

  return NextResponse.json({
    runtime: {
      KIS_APPKEY: mask(runtime.KIS_APPKEY),
      KIS_APPSECRET: mask(runtime.KIS_APPSECRET),
      KIS_APPKEY_length: runtime.KIS_APPKEY.length,
      KIS_APPSECRET_length: runtime.KIS_APPSECRET.length,
    },
    file: {
      KIS_APPKEY: mask(file.KIS_APPKEY),
      KIS_APPSECRET: mask(file.KIS_APPSECRET),
      KIS_APPKEY_length: file.KIS_APPKEY.length,
      KIS_APPSECRET_length: file.KIS_APPSECRET.length,
    },
    compare,
    repeatCheck,
  });
}
