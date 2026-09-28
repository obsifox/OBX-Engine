import { describe, expect, it } from "vitest";
import {
  AABB,
  Color,
  Colors,
  Mat4,
  Quat,
  Sphere,
  Transform2D,
  Transform3D,
  Vec2,
  Vec3,
} from "@obx/math";

describe("Vec2", () => {
  it("performs vector algebra", () => {
    const v = new Vec2(3, 4);
    expect(v.length()).toBe(5);
    expect(v.lengthSq()).toBe(25);
    expect(new Vec2(1, 1).add(new Vec2(2, 3))).toEqual(new Vec2(3, 4));
    expect(new Vec2(5, 5).sub(new Vec2(2, 1))).toEqual(new Vec2(3, 4));
    expect(new Vec2(2, 3).scale(2)).toEqual(new Vec2(4, 6));
    expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
    expect(new Vec2(1, 0).cross(new Vec2(0, 1))).toBe(1);
  });

  it("normalizes and rotates", () => {
    const n = new Vec2(10, 0).normalize();
    expect(n.equals(new Vec2(1, 0))).toBe(true);
    const rotated = new Vec2(1, 0).rotate(Math.PI / 2);
    expect(rotated.equals(new Vec2(0, 1), 1e-9)).toBe(true);
    expect(Vec2.fromAngle(Math.PI / 2, 2).equals(new Vec2(0, 2), 1e-9)).toBe(true);
  });

  it("lerps and measures distance", () => {
    const out = Vec2.lerp(new Vec2(0, 0), new Vec2(10, 20), 0.5);
    expect(out.equals(new Vec2(5, 10))).toBe(true);
    expect(Vec2.distance(new Vec2(0, 0), new Vec2(3, 4))).toBe(5);
    expect(new Vec2(1, 1).distanceTo(new Vec2(4, 5))).toBe(5);
    expect(Vec2.distanceSq(new Vec2(0, 0), new Vec2(3, 4))).toBe(25);
  });

  it("converts to and from arrays", () => {
    expect(Vec2.fromArray([5, 6, 7], 1).equals(new Vec2(6, 7))).toBe(true);
    expect(new Vec2(1, 2).toArray()).toEqual([1, 2]);
  });
});

describe("Vec3", () => {
  it("supports cross products and normalization", () => {
    const c = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
    expect(c.equals(new Vec3(0, 0, 1))).toBe(true);
    expect(new Vec3(0, 5, 0).normalize().equals(new Vec3(0, 1, 0))).toBe(true);
    expect(Vec3.distance(new Vec3(1, 2, 2), new Vec3(1, 2, 6))).toBe(4);
    expect(Vec3.distanceSq(new Vec3(0, 0, 0), new Vec3(1, 2, 2))).toBe(9);
    expect(Vec3.lerp(new Vec3(0, 0, 0), new Vec3(2, 4, 6), 0.5).equals(new Vec3(1, 2, 3))).toBe(true);
  });
});

describe("Quat", () => {
  it("rotates vectors around axes", () => {
    const q = Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    const rotated = q.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.equals(new Vec3(0, 0, -1), 1e-9)).toBe(true);
  });

  it("composes rotations by multiplication", () => {
    const yaw = Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    const pitch = Quat.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2);
    const combined = Quat.multiply(yaw, pitch);
    const v = combined.rotateVec3(new Vec3(0, 1, 0));
    const expected = yaw.rotateVec3(pitch.rotateVec3(new Vec3(0, 1, 0)));
    expect(v.equals(expected, 1e-9)).toBe(true);
  });

  it("slerps between orientations", () => {
    const a = Quat.identity();
    const b = Quat.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
    const mid = Quat.slerp(a, b, 0.5);
    const rotated = mid.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.equals(new Vec3(Math.SQRT1_2, Math.SQRT1_2, 0), 1e-9)).toBe(true);
    expect(Quat.slerp(a, b, 0).equals(a)).toBe(true);
    expect(Quat.slerp(a, b, 1).equals(b, 1e-9)).toBe(true);
  });

  it("builds euler angles and inverts", () => {
    const q = Quat.fromEuler(0.3, 0.7, -0.2);
    const inv = q.clone().invert();
    const roundTrip = inv.rotateVec3(q.rotateVec3(new Vec3(1, 2, 3)));
    expect(roundTrip.equals(new Vec3(1, 2, 3), 1e-9)).toBe(true);
    expect(q.clone().normalize().length()).toBeCloseTo(1, 12);
  });
});

describe("Mat4", () => {
  it("multiplies identity correctly", () => {
    const t = Mat4.fromTranslation(1, 2, 3);
    const m = Mat4.multiply(Mat4.identity(), t);
    expect(m.equals(t)).toBe(true);
  });

  it("transforms points with translation and scale", () => {
    const m = new Mat4().setTranslation(10, 0, 0);
    m.multiply(Mat4.fromScale(2, 2, 2));
    const p = m.transformPoint(new Vec3(1, 1, 0));
    expect(p.equals(new Vec3(12, 2, 0), 1e-9)).toBe(true);
  });

  it("inverts TRS matrices precisely", () => {
    const rotation = Quat.fromEuler(0.4, 0.9, -0.3);
    const m = new Mat4().compose(new Vec3(5, -2, 7), rotation, new Vec3(2, 3, 0.5));
    const inverse = m.clone().invert();
    const identity = Mat4.multiply(m, inverse);
    const expected = Mat4.identity();
    expect(identity.equals(expected, 1e-9)).toBe(true);
  });

  it("round-trips points through inverse", () => {
    const m = new Mat4().compose(
      new Vec3(1, 2, 3),
      Quat.fromAxisAngle(new Vec3(1, 1, 0).normalize(), 1.1),
      new Vec3(1.5, 0.5, 2),
    );
    const p = new Vec3(-4, 0.25, 9);
    const restored = m.clone().invert().transformPoint(m.transformPoint(p));
    expect(restored.equals(p, 1e-9)).toBe(true);
  });

  it("transposes", () => {
    const m = new Mat4().setTranslation(1, 2, 3);
    const t = m.clone().transpose();
    expect(t.elements[12]).toBe(0);
    expect(t.elements[3]).toBe(1);
  });

  it("projects with orthographic and perspective", () => {
    const ortho = Mat4.orthographic(0, 100, 100, 0, -1, 1);
    const corner = ortho.transformPoint(new Vec3(0, 0, 0));
    expect(corner.equals(new Vec3(-1, 1, 0), 1e-9)).toBe(true);
    const center = ortho.transformPoint(new Vec3(50, 50, 0));
    expect(center.equals(new Vec3(0, 0, 0), 1e-9)).toBe(true);

    const persp = Mat4.perspective(Math.PI / 2, 1, 0.1, 100);
    const onAxis = persp.transformPoint(new Vec3(0, 0, -0.1));
    expect(onAxis.z).toBeCloseTo(-1, 6);
  });

  it("looks at targets", () => {
    const view = Mat4.lookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
    const target = view.transformPoint(new Vec3(0, 0, 0));
    expect(target.equals(new Vec3(0, 0, -5), 1e-9)).toBe(true);
    const dir = view.transformDirection(new Vec3(0, 0, -1));
    expect(dir.equals(new Vec3(0, 0, -1), 1e-9)).toBe(true);
  });

  it("throws on non-invertible matrices", () => {
    const singular = Mat4.fromScale(0, 1, 1);
    expect(() => singular.invert()).toThrowError("not invertible");
  });
});

describe("Bounds", () => {
  it("AABB unions and intersects", () => {
    const a = AABB.fromCenterSize(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
    const b = AABB.fromCenterSize(new Vec3(1.5, 0, 0), new Vec3(2, 2, 2));
    expect(a.intersects(b)).toBe(true);
    expect(a.containsPoint(new Vec3(1, 1, 1))).toBe(true);
    expect(a.containsPoint(new Vec3(1.2, 0, 0))).toBe(false);
    expect(AABB.fromCenterSize(new Vec3(5, 5, 5), new Vec3(2, 2, 2)).intersects(a)).toBe(false);

    const union = a.clone().union(b);
    expect(union.max.x).toBeCloseTo(2.5);
    expect(union.min.x).toBeCloseTo(-1);

    const outer = AABB.fromCenterSize(new Vec3(0, 0, 0), new Vec3(10, 10, 10));
    expect(outer.containsBox(a)).toBe(true);
    expect(a.containsBox(outer)).toBe(false);
  });

  it("AABB works with spheres", () => {
    const box = AABB.fromCenterSize(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
    expect(box.intersectsSphere(new Sphere(new Vec3(3, 0, 0), 2.5))).toBe(true);
    expect(box.intersectsSphere(new Sphere(new Vec3(3, 0, 0), 1.5))).toBe(false);
  });

  it("spheres contain and expand", () => {
    const s = new Sphere(new Vec3(0, 0, 0), 1);
    expect(s.containsPoint(new Vec3(0.5, 0.5, 0.5))).toBe(true);
    expect(s.intersects(new Sphere(new Vec3(1.8, 0, 0), 1))).toBe(true);
    s.expandByPoint(new Vec3(4, 0, 0));
    expect(s.radius).toBeGreaterThanOrEqual(2);
    expect(s.containsPoint(new Vec3(4, 0, 0))).toBe(true);
    expect(s.containsPoint(new Vec3(-4, 0, 0))).toBe(false);
    expect(s.intersectsBox(AABB.fromCenterSize(new Vec3(4, 0, 0), new Vec3(1, 1, 1)))).toBe(true);
  });

  it("builds AABBs from points", () => {
    const box = AABB.fromPoints([new Vec3(1, 2, 3), new Vec3(-1, 0, 5)]);
    expect(box.min.equals(new Vec3(-1, 0, 3))).toBe(true);
    expect(box.max.equals(new Vec3(1, 2, 5))).toBe(true);
    expect(box.center().equals(new Vec3(0, 1, 4))).toBe(true);
    expect(box.size().equals(new Vec3(2, 2, 2))).toBe(true);
  });
});

describe("Color", () => {
  it("parses hex and formats outputs", () => {
    const c = Color.fromHex("#FF6A1A");
    expect(c.r).toBeCloseTo(1, 2);
    expect(c.g).toBeCloseTo(106 / 255, 5);
    expect(c.toHex()).toBe("#FF6A1A");
    expect(Color.fromHex("#FFF").toHex()).toBe("#FFFFFF");
    expect(Color.fromHex("#00000080").a).toBeCloseTo(128 / 255, 5);
    expect(() => Color.fromHex("#GGG")).toThrowError("Invalid hex color");
  });

  it("multiplies and lerps", () => {
    const half = Color.fromRgba8(128, 128, 128, 255);
    const result = half.clone().multiply(Color.fromRgba8(255, 0, 0, 255));
    expect(result.toRgba8()[0]).toBe(128);
    expect(result.toRgba8()[1]).toBe(0);
    const lerped = Color.lerp(Colors.black, Colors.white, 0.5);
    expect(lerped.r).toBeCloseTo(0.5);
    expect(Colors.foxOrange.toHex()).toBe("#FF6A1A");
  });

  it("exposes css and alpha helpers", () => {
    expect(new Color(1, 0.5, 0, 0.5).toCss()).toBe("rgba(255, 128, 0, 0.5)");
    expect(new Color(1, 1, 1, 1).withAlpha(0.25).a).toBe(0.25);
  });
});

describe("Transform2D", () => {
  it("combines parent and child transforms", () => {
    const parent = new Transform2D(new Vec2(10, 0), Math.PI / 2, new Vec2(2, 2));
    const child = new Transform2D(new Vec2(1, 0), 0, new Vec2(1, 1));
    const world = child.combineWith(parent);
    expect(world.position.equals(new Vec2(10, 2), 1e-9)).toBe(true);
    expect(world.rotation).toBeCloseTo(Math.PI / 2);
    expect(world.scale.equals(new Vec2(2, 2), 1e-9)).toBe(true);
  });

  it("applies and inverts points", () => {
    const t = new Transform2D(new Vec2(5, 5), Math.PI / 2, new Vec2(2, 2));
    const p = t.applyPoint(new Vec2(1, 0));
    expect(p.equals(new Vec2(5, 7), 1e-9)).toBe(true);
    const back = t.inverseApplyPoint(p);
    expect(back.equals(new Vec2(1, 0), 1e-9)).toBe(true);
  });

  it("converts to matrix consistently", () => {
    const t = new Transform2D(new Vec2(3, -2), 0.7, new Vec2(2, 0.5));
    const viaMatrix = t.toMat4().transformPoint(new Vec3(1, 1, 0));
    const direct = t.applyPoint(new Vec2(1, 1));
    expect(viaMatrix.x).toBeCloseTo(direct.x, 9);
    expect(viaMatrix.y).toBeCloseTo(direct.y, 9);
  });

  it("interpolates with shortest rotation path", () => {
    const a = new Transform2D(new Vec2(0, 0), 0, new Vec2(1, 1));
    const b = new Transform2D(new Vec2(10, 10), Math.PI, new Vec2(3, 3));
    const mid = Transform2D.lerp(a, b, 0.5);
    expect(mid.position.equals(new Vec2(5, 5))).toBe(true);
    expect(mid.scale.equals(new Vec2(2, 2))).toBe(true);
    expect(mid.rotation).toBeCloseTo(Math.PI / 2);

    const wrapped = Transform2D.lerp(
      new Transform2D(new Vec2(0, 0), Math.PI * 0.9, new Vec2(1, 1)),
      new Transform2D(new Vec2(0, 0), -Math.PI * 0.9, new Vec2(1, 1)),
      0.5,
    );
    expect(Math.abs(wrapped.rotation)).toBeGreaterThan(Math.PI / 2);
    expect(Math.abs(wrapped.rotation)).toBeLessThanOrEqual(Math.PI);
  });
});

describe("Transform3D", () => {
  it("combines hierarchy and round-trips points", () => {
    const parent = new Transform3D(
      new Vec3(1, 2, 3),
      Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2),
      new Vec3(2, 2, 2),
    );
    const child = new Transform3D(new Vec3(1, 0, 0), Quat.identity(), new Vec3(1, 1, 1));
    const world = child.combineWith(parent);
    const p = new Vec3(0.5, -1, 2);
    const expected = parent.applyPoint(child.applyPoint(p));
    const viaWorld = world.applyPoint(p);
    expect(viaWorld.equals(expected, 1e-9)).toBe(true);
    const restored = world.inverseApplyPoint(viaWorld);
    expect(restored.equals(p, 1e-9)).toBe(true);
  });

  it("lerps positions and rotations", () => {
    const a = new Transform3D(new Vec3(0, 0, 0), Quat.identity(), new Vec3(1, 1, 1));
    const b = new Transform3D(
      new Vec3(10, 0, 0),
      Quat.fromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2),
      new Vec3(1, 1, 1),
    );
    const mid = Transform3D.lerp(a, b, 0.5);
    expect(mid.position.equals(new Vec3(5, 0, 0))).toBe(true);
    const rotated = mid.rotation.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(rotated.y).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
