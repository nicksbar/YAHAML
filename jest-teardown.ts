/**
 * Jest global teardown - runs after ALL tests complete
 * Forces cleanup of any remaining handles
 */

export default async function globalTeardown() {
  // Give async operations a moment to finish
  await new Promise(resolve => setTimeout(resolve, 200));
}
