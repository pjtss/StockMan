import { createPublicKey, verify } from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(body: string, signatureHex: string | null, timestamp: string | null, publicKeyHex = process.env.DISCORD_PUBLIC_KEY || "") {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(`${timestamp}${body}`), key, Buffer.from(signatureHex, "hex"));
  } catch { return false; }
}
