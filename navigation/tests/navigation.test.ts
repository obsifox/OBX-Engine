import { describe, expect, it } from "vitest";
import {
  AStar,
  Crowd,
  DynamicObstacle,
  NavGrid,
  NavigationRegion,
  PathAgent,
  lineOfSight,
  smoothPath,
} from "../src/index.js";

function openGrid(width = 12, height = 12): NavGrid {
  return new NavGrid(width, height, 1);
}

describe("NavGrid", () => {
  it("tracks walkability and costs with clamping", () => {
    const grid = openGrid();
    expect(grid.isWalkable(3, 4)).toBe(true);
    grid.setWalkable(3, 4, false);
    expect(grid.isWalkable(3, 4)).toBe(false);
    expect(grid.isWalkable(-1, 0)).toBe(false);
    grid.setCost(2, 2, 4);
    expect(grid.cost(2, 2)).toBe(4);
    grid.setCost(2, 2, -3);
    expect(grid.cost(2, 2)).toBeCloseTo(0.01, 6);
    grid.blockRect(0, 0, 2, 3, false);
    expect(grid.isWalkable(0, 0)).toBe(false);
    expect(grid.isWalkable(1, 2)).toBe(false);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it("converts world and cell coordinates", () => {
    const grid = new NavGrid(8, 8, 2);
    expect(grid.worldToCell(5, 3)).toEqual({ x: 2, z: 1 });
    expect(grid.cellToWorld(2, 1)).toEqual({ x: 5, z: 3 });
  });
});

describe("AStar", () => {
  it("finds a straight path across open ground", () => {
    const grid = openGrid();
    const path = new AStar(grid).findPath({ x: 1.5, z: 1.5 }, { x: 9.5, z: 1.5 });
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]!.x).toBeCloseTo(1.5, 5);
    expect(path[path.length - 1]!.x).toBeCloseTo(9.5, 5);
  });

  it("routes around obstacles", () => {
    const grid = openGrid();
    grid.blockRect(5, 0, 1, 11, false);
    const path = new AStar(grid).findPath({ x: 1.5, z: 5.5 }, { x: 10.5, z: 5.5 });
    expect(path.length).toBeGreaterThan(2);
    for (const point of path) {
      const cell = grid.worldToCell(point.x, point.z);
      expect(grid.isWalkable(cell.x, cell.z)).toBe(true);
    }
    expect(path.some((point) => point.z < 5.5 || point.z > 5.5)).toBe(true);
  });

  it("returns empty paths for blocked endpoints and single point for same cell", () => {
    const grid = openGrid();
    grid.setWalkable(2, 2, false);
    expect(new AStar(grid).findPath({ x: 2.5, z: 2.5 }, { x: 8.5, z: 8.5 })).toEqual([]);
    expect(new AStar(grid).findPath({ x: 8.5, z: 8.5 }, { x: 2.5, z: 2.5 })).toEqual([]);
    const same = new AStar(grid).findPath({ x: 3.5, z: 3.5 }, { x: 3.7, z: 3.2 });
    expect(same.length).toBe(1);
    expect(same[0]!.x).toBeCloseTo(3.5, 5);
  });

  it("never cuts blocked diagonal corners", () => {
    const grid = openGrid(4, 4);
    grid.setWalkable(1, 0, false);
    const path = new AStar(grid).findPath({ x: 0.5, z: 0.5 }, { x: 2.5, z: 2.5 });
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path[1]!.x).toBeCloseTo(0.5, 5);
    expect(path[1]!.z).toBeCloseTo(1.5, 5);
  });

  it("prefers cheap detours over expensive corridors", () => {
    const grid = openGrid(9, 5);
    for (let z = 1; z <= 3; z += 1) grid.setCost(4, z, 50);
    const path = new AStar(grid).findPath({ x: 0.5, z: 2.5 }, { x: 8.5, z: 2.5 });
    expect(path.some((point) => grid.cost(grid.worldToCell(point.x, point.z).x, grid.worldToCell(point.x, point.z).z) === 50)).toBe(false);
    expect(path.length).toBeGreaterThan(2);
  });
});

describe("lineOfSight and smoothPath", () => {
  it("detects occlusion", () => {
    const grid = openGrid();
    expect(lineOfSight(grid, { x: 0.5, z: 0.5 }, { x: 10.5, z: 0.5 })).toBe(true);
    grid.blockRect(5, 0, 1, 6, false);
    expect(lineOfSight(grid, { x: 0.5, z: 0.5 }, { x: 10.5, z: 0.5 })).toBe(false);
  });

  it("reduces waypoints and preserves endpoints", () => {
    const grid = openGrid();
    const raw = new AStar(grid).findPath({ x: 0.5, z: 0.5 }, { x: 9.5, z: 4.5 });
    const smooth = smoothPath(grid, raw);
    expect(smooth.length).toBeLessThanOrEqual(raw.length);
    expect(smooth.length).toBeGreaterThanOrEqual(2);
    expect(smooth[0]).toEqual(raw[0]);
    expect(smooth[smooth.length - 1]).toEqual(raw[raw.length - 1]);
    expect(smoothPath(grid, [{ x: 1, z: 1 }])).toEqual([{ x: 1, z: 1 }]);
    expect(smoothPath(grid, [{ x: 1, z: 1 }, { x: 2, z: 2 }])).toEqual([{ x: 1, z: 1 }, { x: 2, z: 2 }]);
  });
});

describe("PathAgent and Crowd", () => {
  it("follows its path to the goal", () => {
    const grid = openGrid();
    const agent = new PathAgent(grid, 0.5, 0.5, { speed: 4, arrival: 0.2 });
    const path = new AStar(grid).findPath({ x: 0.5, z: 0.5 }, { x: 9.5, z: 0.5 });
    agent.setPath(path);
    for (let i = 0; i < 200 && !agent.finished; i += 1) agent.update(0.1);
    expect(agent.finished).toBe(true);
    expect(agent.x).toBeCloseTo(9.5, 0);
    expect(Math.abs(agent.z - 0.5)).toBeLessThan(0.5);
  });

  it("stops advancing into blocked cells", () => {
    const grid = openGrid();
    grid.blockRect(3, 0, 1, 3, false);
    const agent = new PathAgent(grid, 0.5, 0.5, { speed: 5, arrival: 0.1 });
    agent.setPath([{ x: 8.5, z: 0.5 }]);
    for (let i = 0; i < 50; i += 1) agent.update(0.1);
    expect(agent.x).toBeLessThan(3);
  });

  it("keeps crowd members separated", () => {
    const grid = openGrid();
    const crowd = new Crowd();
    const a = crowd.add(new PathAgent(grid, 0.5, 0.5, { speed: 3, avoidanceRadius: 1.5 }));
    const b = crowd.add(new PathAgent(grid, 3.5, 0.5, { speed: 3, avoidanceRadius: 1.5 }));
    a.setPath([{ x: 3.5, z: 0.5 }]);
    b.setPath([{ x: 0.5, z: 0.5 }]);
    for (let i = 0; i < 60; i += 1) {
      crowd.update(0.1);
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      expect(distance).toBeGreaterThan(0.05);
    }
    expect(crowd.agents.length).toBe(2);
  });

  it("reports finished only when every agent is done", () => {
    const grid = openGrid();
    const crowd = new Crowd();
    const a = crowd.add(new PathAgent(grid, 0.5, 0.5, { speed: 10 }));
    const b = crowd.add(new PathAgent(grid, 5.5, 5.5, { speed: 10 }));
    a.setPath([]);
    b.setPath([{ x: 11.5, z: 11.5 }]);
    expect(a.finished).toBe(true);
    expect(b.finished).toBe(false);
    expect(crowd.finished).toBe(false);
  });
});

describe("DynamicObstacle and NavigationRegion", () => {
  it("blocks and restores cells", () => {
    const grid = openGrid();
    const obstacle = new DynamicObstacle({ x: 2, z: 2, width: 2, height: 2 });
    obstacle.apply(grid);
    expect(obstacle.applied).toBe(true);
    expect(grid.isWalkable(2, 2)).toBe(false);
    obstacle.clear(grid);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it("applies region costs only on walkable cells", () => {
    const grid = openGrid();
    grid.setWalkable(1, 1, false);
    new NavigationRegion("mud", 3.5, { x: 0, z: 0, width: 3, height: 3 }).apply(grid);
    expect(grid.cost(1, 1)).toBe(1);
    expect(grid.cost(0, 0)).toBe(3.5);
  });
});
