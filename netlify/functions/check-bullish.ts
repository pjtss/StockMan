import { schedule } from "@netlify/functions";

export const handler = schedule("*/1 * * * *", async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: 0,
      disabled: true,
    }),
  };
});
