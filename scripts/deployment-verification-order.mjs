export async function runDeploymentVerification({ fastGates, build, runtime, quality }) {
  await fastGates();
  await build();
  await runtime();
  await quality();
}
