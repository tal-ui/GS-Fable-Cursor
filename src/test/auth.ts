import type { CurrentUser } from "@/lib/auth/session";

/**
 * Test-only replacement for the cookie session. Suites call `vi.mock("@/lib/auth/session")` and
 * route `getCurrentUser` here, then set `testAuth.user` to act as a given seeded user.
 */
export const testAuth: { user: CurrentUser | null } = { user: null };
