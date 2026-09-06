import { runAccumulationScreener } from "./accumulation-screener";

/** Compatibility entry point; both markets use the complete shared v2 pipeline. */
export async function runUsAccumulationScreener(limit = 100, minRvol = 2) {
  return (await runAccumulationScreener("US", { limit, minRvol })).results;
}
