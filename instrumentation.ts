export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const nodeInstrumentation = await import("./instrumentation-node");
    await nodeInstrumentation.register();
  }
}
