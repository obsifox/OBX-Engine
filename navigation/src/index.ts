export {
  AStar,
  Crowd,
  DynamicObstacle,
  NavGrid,
  NavigationRegion,
  PathAgent,
  lineOfSight,
  smoothPath,
  type AgentOptions,
  type GridNode,
  type PathPoint,
} from "./navigation.js";
export * from "./navmesh.js";
export * from "./dynamic.js";
export * from "./agent.js";

export const NAVIGATION_VERSION = "0.7.0";
