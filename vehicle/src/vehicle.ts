import { Vec3 } from "@obx/math";
import { Body, type PhysicsWorld, type RayHitResult, type Shape, boxShape } from "@obx/physics";

export interface WheelConfig {
  name: string;
  radius: number;
  restLength: number;
  stiffness: number;
  damping: number;
  maxSteerAngle: number;
  powered: boolean;
  position: Vec3;
}

export interface EngineTorquePoint {
  rpm: number;
  torque: number;
}

export interface EngineConfig {
  idleRpm: number;
  maxRpm: number;
  torqueCurve: readonly EngineTorquePoint[];
  gearRatios: readonly number[];
  finalDrive: number;
  reverseRatio: number;
  brakeTorque: number;
  engineBraking: number;
  upshiftRpm: number;
  downshiftRpm: number;
}

export interface VehicleConfig {
  chassisShape: Shape;
  mass: number;
  position: Vec3;
  wheels: readonly WheelConfig[];
  engine: EngineConfig;
  lateralGrip: number;
  longitudinalGrip: number;
  handbrakeGrip: number;
  downforce: number;
  steerRate: number;
  inertia: number;
  damageThreshold: number;
}

export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  reverse: boolean;
}

export function vehicleInput(over: Partial<VehicleInput> = {}): VehicleInput {
  return {
    throttle: over.throttle ?? 0,
    brake: over.brake ?? 0,
    steer: over.steer ?? 0,
    handbrake: over.handbrake ?? false,
    reverse: over.reverse ?? false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class Wheel {
  steerAngle = 0;
  compression = 0;
  previousCompression = 0;
  rotationAngle = 0;
  contact: RayHitResult | null = null;
  load = 0;
  slip = 0;

  constructor(readonly config: WheelConfig) {}

  attachPoint(chassis: Body): Vec3 {
    return chassis.position.clone().add(chassis.rotation.rotateVec3(this.config.position));
  }
}

export class Transmission {
  gear = 1;

  constructor(readonly engine: EngineConfig) {}

  ratio(): number {
    return this.gear < 0 ? this.engine.reverseRatio : (this.engine.gearRatios[this.gear] ?? 1);
  }

  update(rpm: number, input: VehicleInput): void {
    if (input.reverse) {
      if (this.gear >= 0 && rpm < this.engine.downshiftRpm) this.gear = -1;
      return;
    }
    if (this.gear < 0) {
      if (rpm > this.engine.idleRpm * 1.5) this.gear = 0;
      return;
    }
    if (rpm > this.engine.upshiftRpm && this.gear < this.engine.gearRatios.length - 1) {
      this.gear += 1;
    } else if (rpm < this.engine.downshiftRpm && this.gear > 0) {
      this.gear -= 1;
    }
  }
}

export class Engine {
  rpm: number;

  constructor(readonly config: EngineConfig) {
    this.rpm = config.idleRpm;
  }

  torque(rpm: number): number {
    const curve = this.config.torqueCurve;
    if (curve.length === 0) return 0;
    const first = curve[0]!;
    const last = curve[curve.length - 1]!;
    if (rpm <= first.rpm) return first.torque;
    if (rpm >= last.rpm) return last.torque;
    for (let i = 1; i < curve.length; i += 1) {
      const a = curve[i - 1]!;
      const b = curve[i]!;
      if (rpm <= b.rpm) {
        const t = (rpm - a.rpm) / (b.rpm - a.rpm);
        return a.torque + (b.torque - a.torque) * t;
      }
    }
    return last.torque;
  }

  update(targetRpm: number): void {
    this.rpm = clamp(targetRpm, this.config.idleRpm, this.config.maxRpm);
  }
}

export class Vehicle {
  readonly body: Body;
  readonly wheels: Wheel[];
  readonly engine: Engine;
  readonly transmission: Transmission;
  integrity = 1;
  impactEnergy = 0;

  constructor(
    readonly world: PhysicsWorld,
    readonly config: VehicleConfig,
  ) {
    this.body = new Body({
      type: "dynamic",
      shape: config.chassisShape ?? boxShape(new Vec3(1, 0.35, 2)),
      position: config.position.clone(),
      mass: config.mass,
      friction: 0.4,
      restitution: 0.1,
      linearDamping: 0.02,
    });
    this.body.userData = this;
    this.wheels = config.wheels.map((wheel) => new Wheel(wheel));
    this.engine = new Engine(config.engine);
    this.transmission = new Transmission(config.engine);
    world.addBody(this.body);
    const previous = world.onCollisionEnter;
    world.onCollisionEnter = (event) => {
      previous?.(event);
      if (event.a === this.body || event.b === this.body) {
        this.noteImpact(event.penetration * this.config.mass * 10);
      }
    };
  }

  get speed(): number {
    return this.body.velocity.length();
  }

  get forwardSpeed(): number {
    return this.body.velocity.dot(this.body.rotation.rotateVec3(new Vec3(0, 0, 1)));
  }

  private applyAt(chassis: Body, point: Vec3, impulse: Vec3, inertiaInverse: number): void {
    chassis.applyImpulse(impulse);
    const r = point.sub(chassis.position);
    const torque = r.cross(impulse);
    chassis.angularVelocity.add(torque.scale(inertiaInverse));
  }

  noteImpact(energy: number): void {
    if (energy <= this.config.damageThreshold) return;
    this.impactEnergy += energy;
    this.integrity = clamp(this.integrity - (energy - this.config.damageThreshold) / (this.config.mass * 200), 0, 1);
  }

  update(dt: number, input: VehicleInput, world: PhysicsWorld): void {
    const chassis = this.body;
    const up = chassis.rotation.rotateVec3(new Vec3(0, 1, 0));
    const down = up.clone().scale(-1);
    const inertiaInverse = 1 / this.config.inertia;
    let drivenSpeed = 0;
    let drivenCount = 0;

    for (const wheel of this.wheels) {
      const targetSteer = wheel.config.maxSteerAngle * input.steer;
      const steerDelta = clamp(targetSteer - wheel.steerAngle, -this.config.steerRate * dt, this.config.steerRate * dt);
      wheel.steerAngle += steerDelta;
      wheel.previousCompression = wheel.compression;
      const attach = wheel.attachPoint(chassis);
      const maxDistance = wheel.config.restLength + wheel.config.radius;
      const hit = world.raycast(attach, down, maxDistance);
      wheel.contact = hit;
      if (!hit) {
        wheel.compression = 0;
        wheel.load = 0;
        wheel.slip = 0;
        wheel.rotationAngle += chassis.velocity.dot(chassis.rotation.rotateVec3(new Vec3(0, 0, 1))) / wheel.config.radius * dt;
        continue;
      }
      const compression = clamp(maxDistance - hit.distance, 0, wheel.config.restLength);
      const compressionRate = (compression - wheel.previousCompression) / Math.max(dt, 1e-9);
      wheel.compression = compression;
      wheel.load = compression * wheel.config.stiffness;
      const springForce = Math.min(
        compression * wheel.config.stiffness + compressionRate * wheel.config.damping,
        wheel.config.stiffness * wheel.config.restLength * 2,
      );
      const suspensionImpulse = up.clone().scale(Math.max(0, springForce) * dt);
      this.applyAt(chassis, attach, suspensionImpulse, inertiaInverse);

      const forward = chassis.rotation.rotateVec3(
        new Vec3(Math.sin(wheel.steerAngle), 0, Math.cos(wheel.steerAngle)),
      );
      const lateral = up.clone().cross(forward).normalize();
      const forwardSpeed = chassis.velocity.dot(forward);
      const lateralSpeed = chassis.velocity.dot(lateral);
      wheel.slip = Math.abs(lateralSpeed);

      if (wheel.config.powered) {
        const torqueValue = this.engine.torque(this.engine.rpm);
        const driveForce = input.throttle
          * torqueValue
          * this.transmission.ratio()
          * this.config.engine.finalDrive
          * this.config.longitudinalGrip
          * (0.5 + this.integrity * 0.5)
          / wheel.config.radius;
        chassis.applyImpulse(forward.clone().scale(driveForce * dt));
        drivenSpeed += forwardSpeed;
        drivenCount += 1;
      }

      const brake = input.brake * this.config.engine.brakeTorque / wheel.config.radius;
      const rolling = this.config.engine.engineBraking * 0.15;
      const oppose = brake + rolling + (input.handbrake ? this.config.engine.brakeTorque * 0.6 / wheel.config.radius : 0);
      const opposeImpulse = oppose * dt;
      const speedAlong = forwardSpeed;
      const applied = Math.min(Math.abs(speedAlong) / Math.max(dt, 1e-9) * this.config.mass / Math.max(this.wheels.length, 1), opposeImpulse);
      chassis.applyImpulse(forward.clone().scale(-Math.sign(speedAlong || 1) * applied));

      const grip = input.handbrake ? this.config.handbrakeGrip : wheel.config.powered ? this.config.lateralGrip : this.config.lateralGrip * 0.95;
      const lateralImpulse = lateral.clone().scale(-lateralSpeed * grip * dt * this.config.mass / Math.max(this.wheels.length, 1) * 8);
      chassis.applyImpulse(lateralImpulse);
      wheel.rotationAngle += forwardSpeed / wheel.config.radius * dt;
    }

    const downforce = chassis.velocity.lengthSq() * this.config.downforce;
    chassis.applyImpulse(down.clone().scale(downforce * dt));

    const speedFactor = Math.min(1, Math.abs(this.forwardSpeed) / 7);
    const targetOmega = input.steer * this.config.steerRate * speedFactor * Math.sign(this.forwardSpeed || 1);
    chassis.angularVelocity.y += (targetOmega - chassis.angularVelocity.y) * Math.min(1, dt * 4);
    const levelDamp = Math.min(1, dt * 3.5);
    chassis.angularVelocity.x += (0 - chassis.angularVelocity.x) * levelDamp;
    chassis.angularVelocity.z += (0 - chassis.angularVelocity.z) * levelDamp;

    const drivenRpm = drivenCount > 0
      ? Math.abs(drivenSpeed / drivenCount) / (2 * Math.PI * 0.34) * 60 * Math.abs(this.transmission.ratio()) * this.config.engine.finalDrive
      : this.engine.config.idleRpm;
    this.engine.update(Math.max(drivenRpm, this.engine.config.idleRpm));
    this.transmission.update(this.engine.rpm, input);
  }
}

export function createCar(world: PhysicsWorld, over: Partial<VehicleConfig> = {}): Vehicle {
  const config: VehicleConfig = {
    chassisShape: over.chassisShape ?? boxShape(new Vec3(0.9, 0.35, 1.9)),
    mass: over.mass ?? 1200,
    position: over.position ?? new Vec3(0, 1, 0),
    wheels: over.wheels ?? [
      { name: "fl", radius: 0.34, restLength: 0.35, stiffness: 32000, damping: 3400, maxSteerAngle: 0.55, powered: false, position: new Vec3(-0.85, -0.4, 1.25) },
      { name: "fr", radius: 0.34, restLength: 0.35, stiffness: 32000, damping: 3400, maxSteerAngle: 0.55, powered: false, position: new Vec3(0.85, -0.4, 1.25) },
      { name: "rl", radius: 0.34, restLength: 0.35, stiffness: 32000, damping: 3400, maxSteerAngle: 0, powered: true, position: new Vec3(-0.85, -0.4, -1.25) },
      { name: "rr", radius: 0.34, restLength: 0.35, stiffness: 32000, damping: 3400, maxSteerAngle: 0, powered: true, position: new Vec3(0.85, -0.4, -1.25) },
    ],
    engine: over.engine ?? {
      idleRpm: 900,
      maxRpm: 7200,
      torqueCurve: [
        { rpm: 900, torque: 140 },
        { rpm: 2600, torque: 240 },
        { rpm: 4200, torque: 300 },
        { rpm: 5600, torque: 275 },
        { rpm: 7200, torque: 210 },
      ],
      gearRatios: [3.2, 2.1, 1.5, 1.15, 0.92, 0.76],
      finalDrive: 3.7,
      reverseRatio: -3.0,
      brakeTorque: 5200,
      engineBraking: 240,
      upshiftRpm: 6200,
      downshiftRpm: 2400,
    },
    lateralGrip: over.lateralGrip ?? 1.1,
    longitudinalGrip: over.longitudinalGrip ?? 0.85,
    handbrakeGrip: over.handbrakeGrip ?? 0.25,
    downforce: over.downforce ?? 0.35,
    steerRate: over.steerRate ?? 1.8,
    inertia: over.inertia ?? 4200,
    damageThreshold: over.damageThreshold ?? 1200,
  };
  return new Vehicle(world, config);
}

export interface Waypoint {
  position: Vec3;
  targetSpeed: number;
}

export class VehicleAI {
  index = 0;

  constructor(
    readonly vehicle: Vehicle,
    readonly waypoints: readonly Waypoint[],
    readonly lookahead = 5,
  ) {}

  step(): VehicleInput {
    const position = this.vehicle.body.position;
    const current = this.waypoints[this.index];
    if (current && position.distanceTo(current.position) < this.lookahead) {
      this.index = (this.index + 1) % Math.max(this.waypoints.length, 1);
    }
    const target = this.waypoints[this.index] ?? current;
    if (!target) return vehicleInput();
    const toTarget = target.position.clone().sub(position).normalize();
    const forward = this.vehicle.body.rotation.rotateVec3(new Vec3(0, 0, 1));
    const heading = Math.atan2(forward.x, forward.z);
    const bearing = Math.atan2(toTarget.x, toTarget.z);
    let delta = bearing - heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const yawRate = this.vehicle.body.angularVelocity.y;
    const steer = clamp(delta * 1.5 - yawRate * 0.35, -1, 1);
    const speedError = target.targetSpeed - this.vehicle.speed;
    const turnSlowdown = 1 - (Math.abs(delta) / Math.PI) * 0.7;
    const throttle = clamp(speedError * 0.2, 0, 1) * turnSlowdown;
    const brake = speedError < -1 ? clamp(-speedError * 0.15, 0, 1) : 0;
    return vehicleInput({ throttle, brake, steer });
  }
}
