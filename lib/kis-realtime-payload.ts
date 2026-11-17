export async function decryptKisRealtimePayload(ciphertextBase64: string, key: string, iv: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);
  const ivBytes = encoder.encode(iv);
  if (keyBytes.length !== 32 || ivBytes.length !== 16) throw new Error("INVALID_KIS_REALTIME_AES_KEY");

  const binary = atob(ciphertextBase64);
  const ciphertext = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, ciphertext);
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}
