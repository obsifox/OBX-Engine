import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import { Body, CharacterController, PhysicsWorld, boxShape, boundsForShape, characterInput, overlapBoxBox, overlapSphereBox, overlapSpherePlane, overlapSphereSphere, planeShape, rayBox, rayPlane, raySphere, sphereShape, } from "../src/index.js";
describe("ray tests", () => {
    it("hits spheres exactly", () => {
        const hit = raySphere(new Vec3(0, 0, 5), new Vec3(0, 0, -1), 10, new Vec3(0, 0, 0), 1);
        expect(hit).not.toBeNull();
        expect(hit.distance).toBeCloseTo(4, 12);
        expect(hit.point.z).toBeCloseTo(1, 12);
        expect(hit.normal.z).toBeCloseTo(1, 12);
        const miss = raySphere(new Vec3(0, 2, 5), new Vec3(0, 0, -1), 10, new Vec3(0, 0, 0), 1);
        expect(miss).toBeNull();
        const behind = raySphere(new Vec3(0, 0, 5), new Vec3(0, 0, 1), 10, new Vec3(0, 0, 0), 1);
        expect(behind).toBeNull();
    });
    it("hits boxes with slab method", () => {
        const min = new Vec3(-1, -1, -1);
        const max = new Vec3(1, 1, 1);
        const hit = rayBox(new Vec3(0, 0, 5), new Vec3(0, 0, -1), 10, min, max);
        expect(hit.distance).toBeCloseTo(4, 12);
        expect(hit.normal.z).toBe(1);
        const side = rayBox(new Vec3(5, 0, 0), new Vec3(-1, 0, 0), 10, min, max);
        expect(side.distance).toBeCloseTo(4, 12);
        expect(side.normal.x).toBe(1);
        const miss = rayBox(new Vec3(0, 3, 5), new Vec3(0, 0, -1), 10, min, max);
        expect(miss).toBeNull();
    });
    it("hits planes", () => {
        const hit = rayPlane(new Vec3(0, 5, 0), new Vec3(0, -1, 0), 10, new Vec3(0, 1, 0), 0);
        expect(hit.distance).toBeCloseTo(5, 12);
        expect(hit.point.y).toBeCloseTo(0, 12);
        const parallel = rayPlane(new Vec3(0, 5, 0), new Vec3(1, 0, 0), 10, new Vec3(0, 1, 0), 0);
        expect(parallel).toBeNull();
    });
});
describe("shape overlaps", () => {
    it("computes sphere-sphere contacts", () => {
        const hit = overlapSphereSphere(new Vec3(0, 0, 0), 1, new Vec3(1.5, 0, 0), 1);
        expect(hit.penetration).toBeCloseTo(0.5, 12);
        expect(hit.normal.x).toBeCloseTo(1, 12);
        expect(overlapSphereSphere(new Vec3(0, 0, 0), 1, new Vec3(3, 0, 0), 1)).toBeNull();
    });
    it("computes sphere-box contacts", () => {
        const hit = overlapSphereBox(new Vec3(1.4, 0, 0), 0.5, new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
        expect(hit.penetration).toBeCloseTo(0.1, 12);
        expect(hit.normal.x).toBeCloseTo(1, 12);
        const inside = overlapSphereBox(new Vec3(0, 0, 0), 0.2, new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
        expect(inside).not.toBeNull();
        expect(inside.penetration).toBeCloseTo(1.2, 12);
    });
    it("computes box-box contacts on minimum axis", () => {
        const hit = overlapBoxBox(new Vec3(-1, -1, -1), new Vec3(1, 1, 1), new Vec3(0.5, -5, -5), new Vec3(2.5, 5, 5));
        expect(hit.normal.x).toBe(1);
        expect(hit.penetration).toBeCloseTo(0.5, 12);
    });
    it("computes plane contacts", () => {
        const sphereHit = overlapSpherePlane(new Vec3(0, 0.5, 0), 1, new Vec3(0, 1, 0), 0);
        expect(sphereHit.penetration).toBeCloseTo(0.5, 12);
        const boxHit = overlapSpherePlane(new Vec3(0, -2, 0), 1, new Vec3(0, 1, 0), 0);
        expect(boxHit.penetration).toBeCloseTo(3, 12);
    });
    it("computes shape bounds", () => {
        const bounds = boundsForShape(sphereShape(2), new Vec3(1, 1, 1));
        expect(bounds.min.x).toBe(-1);
        expect(bounds.max.y).toBe(3);
        const boxBounds = boundsForShape(boxShape(new Vec3(1, 2, 3)), new Vec3(0, 0, 0));
        expect(boxBounds.max.y).toBe(2);
    });
});
describe("PhysicsWorld", () => {
    it("integrates gravity semi-implicitly", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -10, 0) });
        const body = world.addBody(new Body({ position: new Vec3(0, 0, 0) }));
        world.step(0.1);
        expect(body.velocity.y).toBeCloseTo(-1, 12);
        expect(body.position.y).toBeCloseTo(-0.1, 12);
        world.step(0.1);
        expect(body.velocity.y).toBeCloseTo(-2, 12);
        expect(body.position.y).toBeCloseTo(-0.3, 12);
    });
    it("rests on a static plane with restitution", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -10, 0) });
        world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0), restitution: 0.5 }));
        const ball = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(0, 3, 0), restitution: 0.5, friction: 0 }));
        let maxHeight = 0;
        let bounced = false;
        for (let i = 0; i < 300; i += 1) {
            world.step(1 / 60);
            if (ball.velocity.y > 0.5)
                bounced = true;
            if (bounced)
                maxHeight = Math.max(maxHeight, ball.position.y);
        }
        expect(bounced).toBe(true);
        expect(maxHeight).toBeGreaterThan(1.2);
        expect(maxHeight).toBeLessThan(3.2);
        expect(ball.position.y).toBeCloseTo(1, 1);
    });
    it("does not move static bodies", () => {
        const world = new PhysicsWorld();
        const wall = world.addBody(new Body({ type: "static", shape: boxShape(new Vec3(1, 1, 1)) }));
        world.addBody(new Body({ shape: sphereShape(0.5), position: new Vec3(0, 20, 0) }));
        for (let i = 0; i < 30; i += 1)
            world.step(1 / 60);
        expect(wall.position.y).toBe(0);
    });
    it("reports collision enter and exit events", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, 0, 0) });
        const a = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(0, 0, 0) }));
        const b = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(3, 0, 0) }));
        const events = [];
        world.onCollisionEnter = () => events.push("enter");
        world.onCollisionExit = () => events.push("exit");
        b.velocity.set(-1, 0, 0);
        for (let i = 0; i < 40; i += 1)
            world.step(0.05);
        expect(events[0]).toBe("enter");
        expect(events).toContain("exit");
        void a;
    });
    it("reports trigger overlaps without resolving", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, 0, 0) });
        world.addBody(new Body({ isTrigger: true, shape: sphereShape(1), position: new Vec3(0, 0, 0) }));
        const mover = world.addBody(new Body({ shape: sphereShape(0.5), position: new Vec3(5, 0, 0) }));
        let enters = 0;
        world.onTriggerEnter = () => {
            enters += 1;
        };
        mover.velocity.set(-2, 0, 0);
        for (let i = 0; i < 20; i += 1)
            world.step(0.1);
        expect(enters).toBe(1);
        expect(mover.velocity.x).toBeCloseTo(-2, 12);
    });
    it("filters collisions with layers and masks", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, 0, 0) });
        const first = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(0, 0, 0), layer: 1, mask: 1 }));
        const other = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(1.2, 0, 0), layer: 2, mask: 2 }));
        world.step(0.1);
        expect(world.stepEvents).toHaveLength(0);
        first.mask = 3;
        other.mask = 3;
        world.step(0.1);
        expect(world.stepEvents).toHaveLength(1);
    });
    it("raycasts to the closest body", () => {
        const world = new PhysicsWorld();
        const near = world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(0, 0, 0) }));
        world.addBody(new Body({ shape: sphereShape(1), position: new Vec3(0, 0, -5) }));
        const hit = world.raycast(new Vec3(0, 0, 10), new Vec3(0, 0, -1), 20);
        expect(hit.body).toBe(near);
        expect(hit.distance).toBeCloseTo(9, 12);
        const none = world.raycast(new Vec3(0, 0, 10), new Vec3(0, 0, -1), 20, 2);
        expect(none).toBeNull();
    });
    it("sphere-casts with radius expansion", () => {
        const world = new PhysicsWorld();
        world.addBody(new Body({ type: "static", shape: sphereShape(1), position: new Vec3(0, 0, 0) }));
        const hit = world.sphereCast(new Vec3(0, 0, 10), new Vec3(0, 0, -1), 1, 20);
        expect(hit.distance).toBeCloseTo(8, 12);
        const direct = world.raycast(new Vec3(0, 0, 10), new Vec3(0, 0, -1), 20);
        expect(direct.distance).toBeCloseTo(9, 12);
    });
});
describe("joints", () => {
    it("keeps distance joints near their rest length", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -10, 0) });
        const anchor = world.addBody(new Body({ type: "static", position: new Vec3(0, 5, 0) }));
        const ball = world.addBody(new Body({ position: new Vec3(0, 3, 0), linearDamping: 0.2 }));
        world.addDistanceJoint(anchor, ball, new Vec3(0, 0, 0), new Vec3(0, 0, 0), 2);
        for (let i = 0; i < 600; i += 1)
            world.step(1 / 60);
        const distance = ball.position.distanceTo(anchor.position);
        expect(distance).toBeGreaterThan(1.85);
        expect(distance).toBeLessThan(2.15);
    });
    it("spring joints pull toward the rest length", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, 0, 0) });
        const anchor = world.addBody(new Body({ type: "static", position: new Vec3(0, 0, 0) }));
        const ball = world.addBody(new Body({ position: new Vec3(3, 0, 0), linearDamping: 1.2 }));
        world.addSpringJoint(anchor, ball, new Vec3(0, 0, 0), new Vec3(0, 0, 0), 1, 20, 4);
        for (let i = 0; i < 600; i += 1)
            world.step(1 / 60);
        expect(ball.position.x).toBeGreaterThan(0.7);
        expect(ball.position.x).toBeLessThan(1.3);
    });
});
describe("CharacterController", () => {
    it("walks, jumps and lands", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
        world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0) }));
        const character = new CharacterController(world, {
            position: new Vec3(0, 0.4, 0),
            walkSpeed: 4,
            jumpSpeed: 6,
        });
        for (let i = 0; i < 10; i += 1) {
            character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 0) }), world);
            world.step(1 / 60);
        }
        expect(character.state).toBe("grounded");
        expect(character.body.position.x).toBeGreaterThan(0.4);
        let peak = 0;
        character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 0), jump: true }), world);
        world.step(1 / 60);
        for (let i = 0; i < 120; i += 1) {
            character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 0) }), world);
            world.step(1 / 60);
            peak = Math.max(peak, character.body.position.y);
        }
        expect(peak).toBeGreaterThan(1.2);
        expect(character.state).toBe("grounded");
        expect(character.body.position.y).toBeCloseTo(0.4, 1);
    });
    it("crouches and flies", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
        world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0) }));
        const character = new CharacterController(world, { position: new Vec3(0, 0.4, 0) });
        for (let i = 0; i < 5; i += 1) {
            character.update(1 / 60, characterInput({ crouch: true }), world);
            world.step(1 / 60);
        }
        expect(character.state).toBe("crouching");
        for (let i = 0; i < 5; i += 1) {
            character.update(1 / 60, characterInput({ fly: true, move: new Vec3(0, 1, 0) }), world);
            world.step(1 / 60);
        }
        expect(character.state).toBe("flying");
        expect(character.body.position.y).toBeGreaterThan(0.6);
    });
    it("slides along walls", () => {
        const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
        world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0) }));
        world.addBody(new Body({ type: "static", shape: boxShape(new Vec3(1, 2, 4)), position: new Vec3(3, 2, 0) }));
        const character = new CharacterController(world, { position: new Vec3(0, 0.4, 0), walkSpeed: 5 });
        for (let i = 0; i < 60; i += 1) {
            character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 1).normalize() }), world);
            world.step(1 / 60);
        }
        expect(character.body.position.x).toBeLessThan(3);
        expect(character.body.position.z).toBeGreaterThan(1.5);
        expect(character.state).toBe("grounded");
    });
});
//# sourceMappingURL=physics.test.js.map