export async function runDeploymentVerification({ build, runtime, quality }) {
  await build();
  await runtime();
  await quality();
}
