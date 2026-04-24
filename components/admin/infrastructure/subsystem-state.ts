/**
 * Shared traffic-light state for Infrastructure subsystems. Lives in its
 * own file so both overview-tab (server component) and sparkline (plain
 * function used from server components) can import the type without
 * cross-tab bundling.
 */
export type SubsystemState = 'healthy' | 'degraded' | 'error' | 'unknown';
