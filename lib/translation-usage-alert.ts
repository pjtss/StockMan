/** Keep an alert claim only when delivery succeeds; otherwise allow a later retry. */
export async function sendClaimedTranslationUsageAlert(
  claim: () => Promise<boolean>,
  deliver: () => Promise<boolean>,
  release: () => Promise<void>,
) {
  if (!(await claim())) return false;
  let sent = false;
  try {
    sent = await deliver();
  } catch {
    sent = false;
  }
  if (sent) return true;
  await release();
  return false;
}
