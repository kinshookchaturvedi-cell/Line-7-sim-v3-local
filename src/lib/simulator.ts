/**
 * @module Interlocking
 * Implements route setting, point locking, and track circuit monitoring.
 * NOTE: Interlocking logic is implemented here for safety architecture, 
 * but is bypassed during normal CBTC UTO operations where moving block applies.
 */
export class PointMachine {
    id: string;
    state: 'NORMAL' | 'REVERSE' = 'NORMAL';
    locked: boolean = false;
    constructor(id: string) { this.id = id; }
}

export class TrackCircuit {
    id: string;
    occupied: boolean = false;
    constructor(id: string) { this.id = id; }
}

export class Route {
    id: string;
    startSignal: string;
    endSignal: string;
    requiredPoints: { pointId: string, requiredState: 'NORMAL' | 'REVERSE' }[];
    trackCircuits: string[];

    constructor(id: string, start: string, end: string, points: any[], tracks: string[]) {
        this.id = id;
        this.startSignal = start;
        this.endSignal = end;
        this.requiredPoints = points;
        this.trackCircuits = tracks;
    }
}

export class Interlocking {
    points: Map<string, PointMachine> = new Map();
    tracks: Map<string, TrackCircuit> = new Map();
    routes: Map<string, Route> = new Map();
    activeRoutes: Set<string> = new Set();

    /**
     * Attempts to set a route from origin to destination signal.
     * Checks if track is free and points can be set to desired condition.
     */
    requestRoute(routeId: string): boolean {
        const route = this.routes.get(routeId);
        if (!route) return false;

        // 1. Check if track circuits are free
        for (const tcId of route.trackCircuits) {
            if (this.tracks.get(tcId)?.occupied) return false;
        }

        // 2. Check if points are available
        for (const req of route.requiredPoints) {
            const point = this.points.get(req.pointId);
            if (!point || point.locked) return false;
        }

        // 3. Set and lock points, activate route
        for (const req of route.requiredPoints) {
            const point = this.points.get(req.pointId)!;
            point.state = req.requiredState;
            point.locked = true;
        }

        this.activeRoutes.add(routeId);
        return true; // Route set, signal can turn green
    }

    releaseRoute(routeId: string) {
        const route = this.routes.get(routeId);
        if (!route) return;

        for (const req of route.requiredPoints) {
            const point = this.points.get(req.pointId);
            if (point) point.locked = false;
        }
        this.activeRoutes.delete(routeId);
    }
}

/**
 * @module Physical Environment & Dynamics
 * Simulates train kinematics and physical forces.
 */
export class Train {
    id: string;
    position: number; // meters (front of the train, 0 to 20000 for full loop)
    speed: number; // m/s
    acceleration: number; // m/s^2
    length: number; // meters
    emergencyBrake: boolean;
    maxSpeed: number; // m/s
    targetSpeed: number; // m/s
    advisorySpeed: number; // m/s
    color: string;
    mode: string; // UTO, ATO, ATP, etc.
    
    dwellTimer: number; // seconds remaining at station
    nextStop: number | null; // position of next station

    runDistance: number = 0; // Distance traveled since last stop
    coastDistance: number = 0; // Distance coasted since last stop

    constructor(id: string, position: number, speed: number, color: string, length: number = 70) {
        this.id = id;
        this.position = position;
        this.speed = speed;
        this.acceleration = 0;
        this.length = length;
        this.emergencyBrake = false;
        this.maxSpeed = 90 / 3.6; // 90 km/h
        this.targetSpeed = this.maxSpeed;
        this.advisorySpeed = this.maxSpeed;
        this.color = color;
        this.mode = 'UTO';
        this.dwellTimer = 0;
        this.nextStop = null;
    }

    /**
     * Updates the train's position and speed based on kinematics.
     * @param dt Delta time (cycle time) in seconds
     * @param grade Track grade in radians
     * @param loopLength Total length of the track loop
     */
    move(dt: number, grade: number, loopLength: number) {
        if (this.dwellTimer > 0) {
            this.dwellTimer -= dt;
            this.speed = 0;
            this.acceleration = 0;
            this.runDistance = 0;
            this.coastDistance = 0;
            this.targetSpeed = this.maxSpeed; // Reset target speed for next run
            return;
        }

        // Gravity effect on inclined track (g = 9.8 m/s^2)
        const g = 9.8;
        const gradeAcceleration = -g * Math.sin(grade);

        let commandedAcceleration = 0;

        if (this.emergencyBrake) {
            commandedAcceleration = -1.3; // Emergency brake deceleration limited to 1.3 m/s^2
        } else {
            // Coasting Limit Logic: Coasting should be maximum 20% of movement
            // Implement a sawtooth profile to force acceleration/braking if coasting budget exceeded
            if (this.runDistance > 200 && (this.coastDistance / this.runDistance) > 0.2) {
                if (this.speed >= this.advisorySpeed - 0.5) {
                    this.advisorySpeed = Math.max(0, this.advisorySpeed - 5); // Force braking
                } else if (this.speed <= this.advisorySpeed - 4.5) {
                    // Force acceleration back to advisory
                }
            }

            // Proportional control for service acceleration/braking based on advisory speed
            const speedError = this.advisorySpeed - this.speed;
            // Normal acceleration/deceleration is limited to 1.0 m/s^2
            const pFactor = speedError < 0 ? 1.0 : 0.5; // Brake harder to match curve perfectly
            commandedAcceleration = Math.max(-1.0, Math.min(1.0, speedError * pFactor));
        }

        // Total acceleration includes commanded and environmental forces
        this.acceleration = commandedAcceleration + gradeAcceleration;

        // Kinematics: s = ut + 0.5at^2
        const u = this.speed;
        const a = this.acceleration;
        const t = dt;

        const s = (u * t) + (0.5 * a * t * t);
        
        // Track distances for coasting logic
        this.runDistance += s;
        if (Math.abs(commandedAcceleration) < 0.05) {
            this.coastDistance += s;
        }

        // Update position on the circular loop
        this.position = (this.position + s) % loopLength;
        if (this.position < 0) this.position += loopLength;

        // Kinematics: v = u + at
        this.speed = u + (a * t);

        // Prevent train from reversing direction unintentionally
        if (this.speed < 0) {
            this.speed = 0;
            this.acceleration = 0;
        }
    }
}

/**
 * @module Zone Controller & MA Logic
 * Calculates Movement Authority based on moving block principles.
 */
export class ZoneController {
    safetyBuffer: number; // meters

    constructor(safetyBuffer: number = 200) {
        this.safetyBuffer = safetyBuffer;
    }

    /**
     * Calculates the Movement Authority (MA) distance for a train.
     */
    calculateMADistance(trailing: Train, leading: Train | null, loopLength: number): number {
        if (!leading) {
            return loopLength; // Clear for a full loop
        }
        // Safety Interval: MA of trailing train must end at a defined safety buffer before the rear of leading train.
        const leadingRear = (leading.position - leading.length + loopLength) % loopLength;
        const distToRear = (leadingRear - trailing.position + loopLength) % loopLength;
        
        return Math.max(0, distToRear - this.safetyBuffer);
    }
}

/**
 * @module ATP & Over-speed Protection
 * Monitors speed and enforces dynamic braking curves.
 */
export class ATPModule {
    brakingDeceleration: number; // m/s^2

    constructor(brakingDeceleration: number = 1.0) {
        this.brakingDeceleration = brakingDeceleration;
    }

    /**
     * Calculates the stopping distance based on current speed.
     */
    calculateStoppingDistance(speed: number): number {
        // Derived from v^2 = u^2 + 2as
        return (speed * speed) / (2 * this.brakingDeceleration);
    }

    /**
     * Gets the civil speed limit at a given position (e.g., turnbacks)
     */
    getCivilSpeedLimit(position: number, loopLength: number): number {
        const TURNBACK_SPEED = 25 / 3.6; // 25 km/h in m/s
        const NORMAL_SPEED = 80 / 3.6; // 80 km/h in m/s (User requested max target speed 80)
        const trackLength = loopLength / 2;

        // Turnback zones: 400m before and after the crossovers
        if (position > trackLength - 400 && position < trackLength + 400) return TURNBACK_SPEED;
        if (position > loopLength - 400 || position < 400) return TURNBACK_SPEED;

        return NORMAL_SPEED;
    }

    /**
     * Monitors the train and triggers emergency brake if over-speeding.
     * Returns the calculated safety limit for the train to target.
     */
    monitor(train: Train, distance: number, loopLength: number, safetyMargin: number = 50, isStationStop: boolean = false): number {
        // Calculate Civil Speed Limit (e.g., turnbacks)
        const civilLimit = this.getCivilSpeedLimit(train.position, loopLength);
        
        // Target speed is the civil limit
        train.targetSpeed = civilLimit;

        // Emergency Deceleration is 1.3 m/s^2 as requested
        const emergencyDecel = 1.3;
        
        // EBI limit based on MA distance and 1.3 decel
        const ebiDist = Math.max(0, distance - safetyMargin);
        const ebiLimit = Math.sqrt(2 * emergencyDecel * ebiDist);
        
        const finalEbiLimit = Math.min(ebiLimit, civilLimit + (5/3.6)); // margin of +5km/h over civil

        // Logic: If CurrentSpeed > TargetSpeed + 5 km/h, trigger EmergencyBrake = true
        // Also if exceeding MA allowed EBI
        if (train.speed > finalEbiLimit && !isStationStop) {
            train.emergencyBrake = true;
        } else if (train.speed > civilLimit + 2) {
            train.emergencyBrake = true; // Still protect against gross overspeed
        } else {
            train.emergencyBrake = false;
        }
        
        return civilLimit;
    }
}
