import { Quat, Vec3 } from "@obx/math";
import {
  type Body,
  type CollisionEvent,
  type ContactCallback,
  Body as PhysicsBody,
} from "./body.js";
import {
  boundsForShape,
  overlapBoxBox,
  overlapBoxPlane,
  overlapSphereBox,
  overlapSpherePlane,
  overlapSphereSphere,
  rayBox,
  rayPlane,
  raySphere,
  type RayHit,
  type Shape,
  type ShapeOverlap,
} from "./shapes.js";
import { DistanceJoint, SpringJoint, type Joint } from "./joints.js";

export interface RayHitResult extends RayHit {
  body: Body;
}

export interface PhysicsWorldOptions {
  gravity?: Vec3;
  velocityIterations?: number;
  positionCorrection?: number;
  penetrationSlop?: number;
}

interface Contact {
  a: Body;
  b: Body;
  normal: Vec3;
  penetration: number;
  isTrigger: boolean;
}

function shapeOverlap(
  a: Shape,
  posA: Vec3,
  b: Shape,
  posB: Vec3,
): ShapeOverlap | null {
  const kinds = `${a.kind}:${b.kind}`;
  switch (kinds) {
    case "sphere:sphere":
      return overlapSphereSphere(posA, (a as { radius: number }).radius, posB, (b as { radius: number }).radius);
    case "sphere:box": {
      const box = b as { halfExtents: Vec3 };
      const min = new Vec3(posB.x - box.halfExtents.x, posB.y - box.halfExtents.y, posB.z - box.halfExtents.z);
      const max = new Vec3(posB.x + box.halfExtents.x, posB.y + box.halfExtents.y, posB.z + box.halfExtents.z);
      const hit = overlapSphereBox(posA, (a as { radius: number }).radius, min, max);
      if (!hit) return null;
      return { normal: hit.normal.scale(-1), penetration: hit.penetration };
    }
    case "box:sphere": {
      const box = a as { halfExtents: Vec3 };
      const min = new Vec3(posA.x - box.halfExtents.x, posA.y - box.halfExtents.y, posA.z - box.halfExtents.z);
      const max = new Vec3(posA.x + box.halfExtents.x, posA.y + box.halfExtents.y, posA.z + box.halfExtents.z);
      return overlapSphereBox(posB, (b as { radius: number }).radius, min, max);
    }
    case "box:box": {
      const boxA = a as { halfExtents: Vec3 };
      const boxB = b as { halfExtents: Vec3 };
      return overlapBoxBox(
        new Vec3(posA.x - boxA.halfExtents.x, posA.y - boxA.halfExtents.y, posA.z - boxA.halfExtents.z),
        new Vec3(posA.x + boxA.halfExtents.x, posA.y + boxA.halfExtents.y, posA.z + boxA.halfExtents.z),
        new Vec3(posB.x - boxB.halfExtents.x, posB.y - boxB.halfExtents.y, posB.z - boxB.halfExtents.z),
        new Vec3(posB.x + boxB.halfExtents.x, posB.y + boxB.halfExtents.y, posB.z + boxB.halfExtents.z),
      );
    }
    case "sphere:plane": {
      const plane = b as { normal: Vec3; offset: number };
      const hit = overlapSpherePlane(posA, (a as { radius: number }).radius, plane.normal, plane.offset);
      if (!hit) return null;
      return { normal: hit.normal.scale(-1), penetration: hit.penetration };
    }
    case "plane:sphere": {
      const plane = a as { normal: Vec3; offset: number };
      return overlapSpherePlane(posB, (b as { radius: number }).radius, plane.normal, plane.offset);
    }
    case "box:plane": {
      const box = a as { halfExtents: Vec3 };
      const plane = b as { normal: Vec3; offset: number };
      const hit = overlapBoxPlane(
        new Vec3(posA.x - box.halfExtents.x, posA.y - box.halfExtents.y, posA.z - box.halfExtents.z),
        new Vec3(posA.x + box.halfExtents.x, posA.y + box.halfExtents.y, posA.z + box.halfExtents.z),
        plane.normal,
        plane.offset,
      );
      if (!hit) return null;
      return { normal: hit.normal.scale(-1), penetration: hit.penetration };
    }
    case "plane:box": {
      const box = b as { halfExtents: Vec3 };
      const plane = a as { normal: Vec3; offset: number };
      return overlapBoxPlane(
        new Vec3(posB.x - box.halfExtents.x, posB.y - box.halfExtents.y, posB.z - box.halfExtents.z),
        new Vec3(posB.x + box.halfExtents.x, posB.y + box.halfExtents.y, posB.z + box.halfExtents.z),
        plane.normal,
        plane.offset,
      );
    }
    case "plane:plane":
      return null;
    default:
      return null;
  }
}

function canCollide(a: Body, b: Body): boolean {
  if (a === b) return false;
  if (a.inverseMass === 0 && b.inverseMass === 0 && !a.isTrigger && !b.isTrigger) return false;
  return (a.mask & b.layer) !== 0 && (b.mask & a.layer) !== 0;
}

export class PhysicsWorld {
  gravity: Vec3;
  readonly bodies: Body[] = [];
  readonly joints: Joint[] = [];
  readonly velocityIterations: number;
  readonly positionCorrection: number;
  readonly penetrationSlop: number;

  onCollisionEnter: ContactCallback | null = null;
  onCollisionStay: ContactCallback | null = null;
  onCollisionExit: ContactCallback | null = null;
  onTriggerEnter: ContactCallback | null = null;
  onTriggerExit: ContactCallback | null = null;

  readonly stepEvents: CollisionEvent[] = [];
  private readonly contacts = new Map<number, Contact>();
  private readonly previousPairs = new Set<number>();

  constructor(options: PhysicsWorldOptions = {}) {
    this.gravity = options.gravity?.clone() ?? new Vec3(0, -9.81, 0);
    this.velocityIterations = options.velocityIterations ?? 8;
    this.positionCorrection = options.positionCorrection ?? 0.8;
    this.penetrationSlop = options.penetrationSlop ?? 0.005;
  }

  addBody(body: Body): Body {
    this.bodies.push(body);
    return body;
  }

  removeBody(body: Body): void {
    const index = this.bodies.indexOf(body);
    if (index >= 0) this.bodies.splice(index, 1);
    for (const [key, contact] of this.contacts) {
      if (contact.a === body || contact.b === body) this.contacts.delete(key);
    }
    for (let i = this.joints.length - 1; i >= 0; i -= 1) {
      const joint = this.joints[i]!;
      if (joint.bodyA === body || joint.bodyB === body) this.joints.splice(i, 1);
    }
  }

  addJoint(joint: Joint): Joint {
    this.joints.push(joint);
    return joint;
  }

  addDistanceJoint(bodyA: Body, bodyB: Body, anchorA: Vec3, anchorB: Vec3, restLength?: number): DistanceJoint {
    const joint = new DistanceJoint(bodyA, bodyB, anchorA, anchorB, restLength);
    this.joints.push(joint);
    return joint;
  }

  addSpringJoint(bodyA: Body, bodyB: Body, anchorA: Vec3, anchorB: Vec3, restLength: number, stiffness: number, damping: number): SpringJoint {
    const joint = new SpringJoint(bodyA, bodyB, anchorA, anchorB, restLength, stiffness, damping);
    this.joints.push(joint);
    return joint;
  }

  step(dt: number): void {
    this.stepEvents.length = 0;
    for (const body of this.bodies) {
      if (body.type !== "dynamic" || body.sleeping) continue;
      body.velocity.add(this.gravity.clone().scale(body.gravityScale * dt));
      body.velocity.add(body.force.clone().scale(body.inverseMass * dt));
      if (body.linearDamping > 0) {
        body.velocity.scale(Math.max(0, 1 - body.linearDamping * dt));
      }
      body.force.set(0, 0, 0);
    }

    for (const joint of this.joints) {
      joint.applyForces(dt);
    }

    const contacts = this.detectContacts();
    for (let iteration = 0; iteration < this.velocityIterations; iteration += 1) {
      for (const contact of contacts) {
        this.resolveVelocity(contact);
      }
      for (const joint of this.joints) {
        joint.solveVelocity();
      }
    }

    for (const body of this.bodies) {
      if (body.type !== "dynamic") continue;
      body.position.add(body.velocity.clone().scale(dt));
      if (body.angularVelocity.lengthSq() > 0) {
        const angle = body.angularVelocity.length() * dt;
        const axis = body.angularVelocity.clone().normalize();
        body.rotation = body.rotation.multiply(Quat.fromAxisAngle(axis, angle));
      }
    }

    for (const contact of contacts) {
      this.correctPosition(contact);
    }

    this.updateContactEvents(contacts);
  }

  private detectContacts(): Contact[] {
    const contacts: Contact[] = [];
    for (let i = 0; i < this.bodies.length; i += 1) {
      const a = this.bodies[i]!;
      const aBounds = a.bounds();
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const b = this.bodies[j]!;
        if (!canCollide(a, b)) continue;
        if (a.shape.kind !== "plane" && b.shape.kind !== "plane") {
          const bBounds = b.bounds();
          if (
            aBounds.max.x < bBounds.min.x ||
            aBounds.min.x > bBounds.max.x ||
            aBounds.max.y < bBounds.min.y ||
            aBounds.min.y > bBounds.max.y ||
            aBounds.max.z < bBounds.min.z ||
            aBounds.min.z > bBounds.max.z
          ) {
            continue;
          }
        }
        const overlap = shapeOverlap(a.shape, a.position, b.shape, b.position);
        if (!overlap) continue;
        contacts.push({
          a,
          b,
          normal: overlap.normal,
          penetration: overlap.penetration,
          isTrigger: a.isTrigger || b.isTrigger,
        });
      }
    }
    return contacts;
  }

  private resolveVelocity(contact: Contact): void {
    if (contact.isTrigger) return;
    const { a, b, normal } = contact;
    const invMassSum = a.inverseMass + b.inverseMass;
    if (invMassSum === 0) return;
    const relative = b.velocity.clone().sub(a.velocity);
    const velocityAlongNormal = relative.dot(normal);
    if (velocityAlongNormal > 0) return;
    const restitution = Math.min(a.restitution, b.restitution);
    const bias = 0;
    const j = (-(1 + restitution) * velocityAlongNormal + bias) / invMassSum;
    const impulse = normal.clone().scale(j);
    a.velocity.sub(impulse.clone().scale(a.inverseMass));
    b.velocity.add(impulse.clone().scale(b.inverseMass));

    const tangent = relative.sub(normal.clone().scale(relative.dot(normal)));
    const tangentLength = tangent.length();
    if (tangentLength > 1e-9) {
      tangent.scale(1 / tangentLength);
      const jt = -relative.dot(tangent) / invMassSum;
      const mu = Math.sqrt(a.friction * b.friction);
      const maxFriction = mu * Math.abs(j);
      const frictionImpulse = tangent.scale(Math.max(-maxFriction, Math.min(maxFriction, jt)));
      a.velocity.sub(frictionImpulse.clone().scale(a.inverseMass));
      b.velocity.add(frictionImpulse.clone().scale(b.inverseMass));
    }
  }

  private correctPosition(contact: Contact): void {
    if (contact.isTrigger) return;
    const invMassSum = contact.a.inverseMass + contact.b.inverseMass;
    if (invMassSum === 0) return;
    const correction = Math.max(contact.penetration - this.penetrationSlop, 0) * this.positionCorrection / invMassSum;
    const push = contact.normal.clone().scale(correction);
    contact.a.position.sub(push.clone().scale(contact.a.inverseMass));
    contact.b.position.add(push.clone().scale(contact.b.inverseMass));
  }

  private updateContactEvents(contacts: Contact[]): void {
    const currentPairs = new Set<number>();
    for (const contact of contacts) {
      const key = pairKey(contact.a, contact.b);
      currentPairs.add(key);
      const existed = this.previousPairs.has(key);
      const event: CollisionEvent = {
        a: contact.a,
        b: contact.b,
        normal: contact.normal.clone(),
        penetration: contact.penetration,
      };
      this.stepEvents.push(event);
      if (contact.isTrigger) {
        if (!existed) this.onTriggerEnter?.(event);
      } else if (existed) {
        this.onCollisionStay?.(event);
      } else {
        this.onCollisionEnter?.(event);
      }
    }
    for (const key of this.previousPairs) {
      if (!currentPairs.has(key)) {
        const contact = this.contacts.get(key);
        if (contact) {
          const event: CollisionEvent = {
            a: contact.a,
            b: contact.b,
            normal: contact.normal.clone(),
            penetration: 0,
          };
          if (contact.isTrigger) this.onTriggerExit?.(event);
          else this.onCollisionExit?.(event);
        }
      }
    }
    this.contacts.clear();
    for (const contact of contacts) {
      this.contacts.set(pairKey(contact.a, contact.b), contact);
    }
    this.previousPairs.clear();
    for (const key of currentPairs) this.previousPairs.add(key);
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance = Infinity, mask = 0xffffffff): RayHitResult | null {
    const dir = direction.clone().normalize();
    let best: RayHitResult | null = null;
    for (const body of this.bodies) {
      if ((mask & body.layer) === 0) continue;
      const hit = rayShape(origin, dir, maxDistance, body.shape, body.position);
      if (!hit) continue;
      if (!best || hit.distance < best.distance) {
        best = { ...hit, body };
      }
    }
    return best;
  }

  sphereCast(origin: Vec3, direction: Vec3, radius: number, maxDistance = Infinity, mask = 0xffffffff): RayHitResult | null {
    return this.sphereCastAll(origin, direction, radius, maxDistance, mask)[0] ?? null;
  }

  sphereCastAll(origin: Vec3, direction: Vec3, radius: number, maxDistance = Infinity, mask = 0xffffffff): RayHitResult[] {
    const dir = direction.clone().normalize();
    const hits: RayHitResult[] = [];
    for (const body of this.bodies) {
      if ((mask & body.layer) === 0) continue;
      const hit = sphereCastShape(origin, dir, radius, maxDistance, body.shape, body.position);
      if (!hit) continue;
      hits.push({ ...hit, body });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }
}

function pairKey(a: Body, b: Body): number {
  return a.id < b.id ? a.id * 1000003 + b.id : b.id * 1000003 + a.id;
}

function rayShape(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  shape: Shape,
  position: Vec3,
): RayHit | null {
  if (shape.kind === "sphere") {
    return raySphere(origin, direction, maxDistance, position, shape.radius);
  }
  if (shape.kind === "box") {
    const h = shape.halfExtents;
    return rayBox(
      origin,
      direction,
      maxDistance,
      new Vec3(position.x - h.x, position.y - h.y, position.z - h.z),
      new Vec3(position.x + h.x, position.y + h.y, position.z + h.z),
    );
  }
  return rayPlane(origin, direction, maxDistance, shape.normal, shape.offset);
}

function sphereCastShape(
  origin: Vec3,
  direction: Vec3,
  radius: number,
  maxDistance: number,
  shape: Shape,
  position: Vec3,
): RayHit | null {
  if (shape.kind === "sphere") {
    return raySphere(origin, direction, maxDistance, position, shape.radius + radius);
  }
  if (shape.kind === "box") {
    const h = shape.halfExtents;
    return rayBox(
      origin,
      direction,
      maxDistance,
      new Vec3(position.x - h.x - radius, position.y - h.y - radius, position.z - h.z - radius),
      new Vec3(position.x + h.x + radius, position.y + h.y + radius, position.z + h.z + radius),
    );
  }
  return rayPlane(origin, direction, maxDistance, shape.normal, shape.offset + radius);
}

export { PhysicsBody };
