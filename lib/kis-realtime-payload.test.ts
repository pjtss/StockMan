import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptKisRealtimePayload } from "./kis-realtime-payload";

describe("KIS realtime payload decryption", () => {
  it("decrypts KIS AES-CBC base64 payloads", async () => {
    const key = "0123456789abcdef0123456789abcdef";
    const iv = "abcdef0123456789";
    const cipher = createCipheriv("aes-256-cbc", Buffer.from(key), Buffer.from(iv));
    const ciphertext = Buffer.concat([cipher.update("70000^100^+1", "utf8"), cipher.final()]).toString("base64");

    await expect(decryptKisRealtimePayload(ciphertext, key, iv)).resolves.toBe("70000^100^+1");
  });

  it("rejects invalid key or IV lengths", async () => {
    await expect(decryptKisRealtimePayload("AA==", "short", "short")).rejects.toThrow("INVALID_KIS_REALTIME_AES_KEY");
  });
});
