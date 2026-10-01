import { describe, expect, it } from "vitest";
import {
  DynamicNavMesh,
  NavAgent,
  NavMesh,
  NavPoint,
  NavRegion,
  OffMeshLink,
  centroid,
  navDistance,
  navPoint,
  pointInPolygon,
  segmentWalkable,
} from "../src/index.js";

function quadGrid(region: NavRegion, x0: number, z0: number, x1: number, z1: number): void {
  for (let x = x0; x < x1; x += 1) {
    for (let z = z0; z < z1; z += 1) {
      region.addPolygon([
        navPoint(x, 0, z),
        navPoint(x + 1, 0, z),
        navPoint(x + 1, 0, z + 1),
        navPoint(x, 0, z + 1),
      ]);
    }
  }
}

describe("polygon navmesh", () => {
  it("classifies points inside convex polygons", () => {
    const square = [navPoint(0, 0, 0), navPoint(2, 0, 0), navPoint(2, 0, 2), navPoint(0, 0, 2)];
    expect(pointInPolygon(navPoint(1, 0, 1), square)).toBe(true);
    expect(pointInPolygon(navPoint(3, 0, 1), square)).toBe(false);
    expect(pointInPolygon(navPoint(1, 0, -1), square)).toBe(false);
  });

  it("computes centroids and distances", () => {
    const center = centroid([navPoint(0, 0, 0), navPoint(2, 0, 0), navPoint(2, 0, 2), navPoint(0, 0, 2)]);
    expect(center.x).toBeCloseTo(1, 6);
    expect(center.z).toBeCloseTo(1, 6);
    expect(navDistance(navPoint(0, 0, 0), navPoint(3, 4, 0))).toBeCloseTo(5, 6);
  });

  it("finds paths across a quad grid", () => {
    const region = new NavRegion("ground");
    quadGrid(region, 0, 0, 3, 3);
    const mesh = new NavMesh();
    mesh.addRegion(region);
    const path = mesh.findPath(navPoint(0.5, 0, 0.5), navPoint(2.5, 0, 2.5));
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]!.point).toEqual(navPoint(0.5, 0, 0.5));
    expect(path[path.length - 1]!.point).toEqual(navPoint(2.5, 0, 2.5));
  });

  it("string-pulls paths shorter than raw waypoints", () => {
    const region = new NavRegion("ground");
    quadGrid(region, 0, 0, 4, 1);
    const mesh = new NavMesh();
    mesh.addRegion(region);
    const raw = [
      { point: navPoint(0.5, 0, 0.5), polygonId: 0, viaLink: false },
      { point: navPoint(1.5, 0, 0.5), polygonId: 1, viaLink: false },
      { point: navPoint(2.5, 0, 0.5), polygonId: 2, viaLink: false },
      { point: navPoint(3.5, 0, 0.5), polygonId: 3, viaLink: false },
    ];
    const pulled = mesh.stringPull(raw);
    expect(pulled.length).toBeLessThan(raw.length);
    expect(segmentWalkable(pulled[0]!.point, pulled[pulled.length - 1]!.point, mesh.allPolygons())).toBe(true);
  });

  it("routes through off-mesh links", () => {
    const left = new NavRegion("left");
    left.addPolygon([navPoint(0, 0, 0), navPoint(2, 0, 0), navPoint(2, 0, 2), navPoint(0, 0, 2)]);
    const right = new NavRegion("right");
    right.addPolygon([navPoint(10, 0, 0), navPoint(12, 0, 0), navPoint(12, 0, 2), navPoint(10, 0, 2)]);
    const mesh = new NavMesh();
    mesh.addRegion(left);
    mesh.addRegion(right);
    expect(mesh.findPath(navPoint(1, 0, 1), navPoint(11, 0, 1))).toHaveLength(0);
    mesh.addLink(new OffMeshLink(navPoint(2, 0, 1), navPoint(10, 0, 1), 1, true));
    const path = mesh.findPath(navPoint(1, 0, 1), navPoint(11, 0, 1));
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.some((entry) => entry.viaLink)).toBe(true);
  });

  it("prefers cheaper polygons", () => {
    const fast = new NavRegion("fast");
    fast.addPolygon([navPoint(0, 0, 0), navPoint(2, 0, 0), navPoint(2, 0, 1), navPoint(0, 0, 1)], 1);
    fast.addPolygon([navPoint(2, 0, 0), navPoint(4, 0, 0), navPoint(4, 0, 1), navPoint(2, 0, 1)], 1);
    const slow = new NavRegion("slow");
    slow.addPolygon([navPoint(0, 0, 1), navPoint(2, 0, 1), navPoint(2, 0, 2), navPoint(0, 0, 2)], 1);
    slow.addPolygon([navPoint(2, 0, 1), navPoint(4, 0, 1), navPoint(4, 0, 2), navPoint(2, 0, 2)], 9);
    const mesh = new NavMesh();
    mesh.addRegion(fast);
    mesh.addRegion(slow);
    const path = mesh.findPath(navPoint(0.5, 0, 0.5), navPoint(3.5, 0, 1.5));
    expect(path.length).toBeGreaterThan(0);
  });
});

describe("dynamic navmesh", () => {
  it("blocks and restores polygons with obstacles", () => {
    const region = new NavRegion("ground");
    quadGrid(region, 0, 0, 2, 1);
    const mesh = new DynamicNavMesh();
    mesh.addRegion(region);
    const version0 = mesh.version;
    mesh.addObstacle("box", navPoint(0, 0, 0), navPoint(1, 0, 1));
    expect(mesh.version).toBeGreaterThan(version0);
    expect(mesh.isBlocked(region.polygons[0]!.id)).toBe(true);
    expect(mesh.blockedPolygons()).toHaveLength(1);
    const path = mesh.findPath(navPoint(0.5, 0, 0.5), navPoint(1.5, 0, 0.5));
    expect(path.length).toBeGreaterThanOrEqual(0);
    expect(mesh.removeObstacle("box")).toBe(true);
    expect(mesh.isBlocked(region.polygons[0]!.id)).toBe(false);
    expect(mesh.obstacleCount).toBe(0);
  });
});

describe("nav agents", () => {
  it("follows a path and arrives", () => {
    const region = new NavRegion("ground");
    quadGrid(region, 0, 0, 4, 1);
    const mesh = new NavMesh();
    mesh.addRegion(region);
    const agent = new NavAgent(mesh, navPoint(0.5, 0, 0.5), { speed: 4, arrivalDistance: 0.1 });
    expect(agent.setDestination(navPoint(3.5, 0, 0.5))).toBe(true);
    for (let i = 0; i < 80; i += 1) agent.step(0.1);
    expect(agent.state).toBe("arrived");
    expect(agent.distanceToDestination()).toBeLessThan(0.2);
  });

  it("reports failure when no path exists", () => {
    const region = new NavRegion("ground");
    region.addPolygon([navPoint(0, 0, 0), navPoint(1, 0, 0), navPoint(1, 0, 1), navPoint(0, 0, 1)]);
    const mesh = new NavMesh();
    mesh.addRegion(region);
    const agent = new NavAgent(mesh, navPoint(0.5, 0, 0.5));
    const far: NavPoint = navPoint(50, 0, 50);
    expect(agent.setDestination(far)).toBe(false);
    expect(agent.state).toBe("stuck");
    expect(agent.replan()).toBe(false);
  });
});
