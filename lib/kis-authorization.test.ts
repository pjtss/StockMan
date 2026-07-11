import { describe, expect, it } from "vitest";
import {
  buildKisAuthorization,
  isKisTokenExpiredErrorMessage,
  isKisTokenExpiredResponse,
} from "./kis-authorization";

describe("KIS authorization", () => {
  it("always appends the DB token to the Bearer scheme", () => {
    expect(buildKisAuthorization("db-access-token")).toBe("Bearer db-access-token");
  });

  it("matches only the explicit token-expiry code or HTTP 401", () => {
    expect(isKisTokenExpiredResponse(200, { msg_cd: "EGW00123" })).toBe(true);
    expect(isKisTokenExpiredResponse(401, null)).toBe(true);
    expect(isKisTokenExpiredResponse(200, { msg_cd: "OPSQ2001" })).toBe(false);
    expect(isKisTokenExpiredErrorMessage("ERROR INPUT FIELD NOT FOUND [AUTH]")).toBe(false);
    expect(isKisTokenExpiredErrorMessage("KIS error [EGW00123]")).toBe(true);
  });
});
