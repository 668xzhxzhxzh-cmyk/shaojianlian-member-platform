/**
 * Runtime bindings are read from the global worker scope in the private Sites
 * preview. The ECS production API uses PostgreSQL and never depends on D1.
 */
export const env = globalThis as unknown as Record<string, unknown>;
