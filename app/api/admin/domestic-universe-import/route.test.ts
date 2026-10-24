import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const state = vi.hoisted(() => ({ admin: true, importMasters: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: () => state.admin }));
vi.mock("@/lib/instrument-universe-import", () => ({ importDomesticInstrumentMasters: state.importMasters }));

function makeForm(files: Array<[string, string]>) {
  const request = new Request("https://example.test/api/admin/domestic-universe-import", { method: "POST" });
  const uploadedFiles = files.map(([name, content]) => ({ name, size: Buffer.byteLength(content), arrayBuffer: async () => Buffer.from(content) }));
  Object.defineProperty(request, "formData", { value: async () => ({ getAll: () => uploadedFiles }) });
  return request;
}

describe("domestic master import API", () => {
  beforeEach(() => {
    state.admin = true;
    state.importMasters.mockReset();
    state.importMasters.mockResolvedValue({ ok: true, sourceCount: 5000, commonStockCount: 4000, overseasUpdated: false });
  });

  it("imports exactly the two domestic KIS masters", async () => {
    const response = await POST(makeForm([["kospi_code.mst", "k"], ["kosdaq_code.mst", "q"]]));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, overseasUpdated: false });
    expect(state.importMasters).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: "kospi_code.mst", buffer: expect.any(Buffer) }),
      expect.objectContaining({ name: "kosdaq_code.mst", buffer: expect.any(Buffer) }),
    ]));
  });

  it("rejects a partial domestic master set", async () => {
    const response = await POST(makeForm([["kospi_code.mst", "k"]]));
    expect(response.status).toBe(400);
    expect(state.importMasters).not.toHaveBeenCalled();
  });

  it("requires admin authentication", async () => {
    state.admin = false;
    const response = await POST(makeForm([["kospi_code.mst", "k"], ["kosdaq_code.mst", "q"]]));
    expect(response.status).toBe(401);
    expect(state.importMasters).not.toHaveBeenCalled();
  });
});
