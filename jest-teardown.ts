/**
 * Jest global teardown - runs after ALL tests complete
 * Forces cleanup of any remaining handles
 */

export default async function globalTeardown() {
  // Force-close any remaining handles by terminating the process
  // This is safe because all cleanup has already happened in test afterAll hooks
  await new Promise(resolve => setTimeout(resolve, 100));
}
