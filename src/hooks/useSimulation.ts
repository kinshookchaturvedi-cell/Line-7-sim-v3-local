import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { Train, ZoneController, ATPModule } from '../lib/simulator';
import type { LogEntry } from '../lib/exportReport';

export const LOOP_LENGTH = 15507.084; // Exact structural loop derived

export const shortNames: Record<string, string> = {
    "Saket G Block": "SGB",
    "Pushp Vihar": "PVH",
    "Saket District Center": "SDC",
    "Pushpa Bhawan": "PBW",
    "Chirag Delhi": "CD",
    "Greater Kailash 1": "GK1",
    "Andrews Ganj": "AG",
    "Lajpat Nagar": "LPN"
};

export const chainages = [
    { name: "Saket G Block", c: 927.7165 },
    { name: "Pushp Vihar", c: 1944.074 },
    { name: "Saket District Center", c: 2565.123 },
    { name: "Pushpa Bhawan", c: 3516.014 },
    { name: "Chirag Delhi", c: 4613.003 },
    { name: "Greater Kailash 1", c: 6301.138 },
    { name: "Andrews Ganj", c: 7268.573 },
    { name: "Lajpat Nagar", c: 8253.542 },
];

export const getPosFromS = (s: number) => {
    s = ((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
    
    // Seg 1: DN Fwd (1095 -> 8253.542)
    if (s <= 7158.542) return { line: 'DN', chainage: 1095 + s, dir: 1 };
    s -= 7158.542;
    
    // Seg 2: DN Rev (8253.542 -> 8180)
    if (s <= 73.542) return { line: 'DN', chainage: 8253.542 - s, dir: -1 };
    s -= 73.542;
    
    // Seg 3: Crossover DN(8180)->UP(8100) (moving left, dir=-1)
    if (s <= 80) return { line: 'CROSS_DN_UP_REV', chainage: 8180 - s, dir: -1 };
    s -= 80;
    
    // Seg 4: UP Fwd (8100 -> 500)
    if (s <= 7600) return { line: 'UP', chainage: 8100 - s, dir: -1 };
    s -= 7600;
    
    // Seg 5: UP Rev (500 -> 1015) (moving right, dir=1)
    if (s <= 515) return { line: 'UP', chainage: 500 + s, dir: 1 };
    s -= 515;
    
    // Seg 6: Crossover UP(1015)->DN(1095) (moving right, dir=1)
    return { line: 'CROSS_UP_DN_FWD', chainage: 1015 + s, dir: 1 };
};

export const getSFromChainage = (ch: number, line: 'DN' | 'UP', dir: 1 | -1) => {
    if (line === 'DN' && dir === 1 && ch >= 1095 && ch <= 8253.542) return ch - 1095;
    if (line === 'DN' && dir === -1 && ch >= 8180 && ch <= 8253.542) return 7158.542 + (8253.542 - ch);
    if (line === 'UP' && dir === -1 && ch >= 500 && ch <= 8100) return 7158.542 + 73.542 + 80 + (8100 - ch);
    if (line === 'UP' && dir === 1 && ch >= 500 && ch <= 1015) return 7158.542 + 73.542 + 80 + 7600 + (ch - 500);
    return 0; // Default fallback
};

export const STOPS: number[] = [];

chainages.forEach((st) => {
    // Collect specific `s` positions where trains will halt on platforms they traverse natively
    if (st.c >= 1095 && st.c <= 8253.542) {
        STOPS.push(st.c - 1095); // Valid DN Forward
    }
    if (st.c <= 8100 && st.c >= 500) {
        STOPS.push(7158.542 + 73.542 + 80 + (8100 - st.c)); // Valid UP Forward
    }
});

// Sort stops so trains can find next stop sequentially
STOPS.sort((a, b) => a - b);
STOPS.push(0); // For end of loop wrapping

export function useSimulation(simSpeedRef: MutableRefObject<number>) {
    const [paused, setPaused] = useState(true);
    const [, forceUpdate] = useState({});
    
    const requestRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);
    const accumulatorRef = useRef<number>(0);

    const zc = useRef(new ZoneController(200));
    const atp = useRef(new ATPModule(1.0)); // Adjusted to 1.0 m/s^2 later in code? wait ATPModule handles it

    // --- Logging ---
    const logRef = useRef<LogEntry[]>([]);
    const lastLogClockRef = useRef<number>(6 * 3600); // track last logged sim time
    const LOG_INTERVAL_SEC = 30; // log every 30 sim-seconds

    const formatSimTime = (sec: number) => {
        const h = Math.floor(sec / 3600).toString().padStart(2, '0');
        const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const simState = useRef<{ trains: Train[], mas: Record<string, number>, clockTime: number, timetable: any[], failures: {id: string, s: number, timer: number}[] }>({
        trains: [],
        mas: {},
        clockTime: 6 * 3600, // Start at 6:00 AM (seconds)
        timetable: [],
        failures: []
    });

    const addFailure = useCallback((s: number, durationMins: number) => {
        simState.current.failures.push({
            id: `F-${Math.floor(Math.random()*1000)}`,
            s: s,
            timer: durationMins * 60
        });
    }, []);

    const parseTimetableTime = (timeStr: string) => {
        if (!timeStr) return 0;
        const parts = timeStr.toString().split(':');
        if (parts.length >= 2) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
        }
        return 0; // fallback
    };

    const loadTimetable = (json: any[]) => {
        if (!json || json.length === 0) return;
        const validEntries = json.filter(j => j['Start time'] && j['End time']);
        if (validEntries.length > 0) {
            simState.current.timetable = validEntries.map(e => ({
                trainNo: e['Train no'],
                startTimeSec: parseTimetableTime(e['Start time']),
                endTimeSec: parseTimetableTime(e['End time']),
                startStation: e['Start Station / siding / chainage'],
                endStation: e['End station /siding / chainage']
            }));
            initSimulation(); // re-init with new timetable
        }
    };

    const spawnTrainsBasedOnTimetable = () => {
        const time = simState.current.clockTime;
        const tt = simState.current.timetable;
        const cols = ['#3498DB', '#F39C12', '#2ECC71', '#9B59B6', '#E74C3C', '#1ABC9C'];
        
        let newTrains: Train[] = [];
        
        if (tt.length > 0) {
            // Find trains that should be active right now
            const activePlans = tt.filter(t => time >= t.startTimeSec && time <= t.endTimeSec);
            newTrains = activePlans.map((plan, i) => {
                const existing = simState.current.trains.find(t => t.id === plan.trainNo);
                if (existing) return existing; // Keep state if already spawned
                
                // Spawn new train at Saket G Block DN as default if start station not parsed fully
                const pos = STOPS[0];
                const t = new Train(plan.trainNo, pos, 0, cols[i % cols.length], 70); 
                t.nextStop = STOPS[1];
                return t;
            });
        } else {
            // Default 6 trains
            if (time >= 6 * 3600 && time <= 23.25 * 3600) {
                // Time is between 6:00 and 23:15
                if (simState.current.trains.length === 6) {
                    newTrains = simState.current.trains; // Keep current trains
                } else {
                    const spacing = LOOP_LENGTH / 6;
                    for (let i = 0; i < 6; i++) {
                        const pos = i * spacing;
                        const t = new Train(`T${i+1}`, pos, 0, cols[i], 70); // 70m length
                        let minDiff = Infinity;
                        let nStop = STOPS[0];
                        for (const stop of STOPS) {
                            const diff = (stop - pos + LOOP_LENGTH) % LOOP_LENGTH;
                            if (diff < minDiff && diff > 0) {
                                minDiff = diff;
                                nStop = stop;
                            }
                        }
                        t.nextStop = nStop;
                        newTrains.push(t);
                    }
                }
            }
        }
        
        simState.current.trains = newTrains;
    };

    const initSimulation = useCallback(() => {
        simState.current.clockTime = 6 * 3600; // Reset to 6:00 AM
        simState.current.trains = [];
        simState.current.mas = {};
        logRef.current = []; // Clear log on reset
        lastLogClockRef.current = 6 * 3600;
        
        spawnTrainsBasedOnTimetable();
        
        setPaused(true);
        accumulatorRef.current = 0;
        lastTimeRef.current = performance.now();
        forceUpdate({});
    }, []);

    useEffect(() => {
        initSimulation();
    }, [initSimulation]);

    const getGrade = (position: number) => {
        return 0;
    };

    useEffect(() => {
        const cycleTime = 0.5;

        const loop = (time: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const dt = (time - lastTimeRef.current) / 1000;
            lastTimeRef.current = time;

            if (!paused) {
                // Ensure delta time doesn't jump too drastically if tab is inactive
                const clampedDt = Math.min(dt, 0.1);
                accumulatorRef.current += clampedDt * simSpeedRef.current;

                while (accumulatorRef.current >= cycleTime) {
                    simState.current.clockTime += cycleTime; // Since accumulator receives sped-up time linearly mapping 1s of fast-forward frames directly into clock
                    
                    // Update failures
                    simState.current.failures = simState.current.failures.filter(f => {
                        f.timer -= cycleTime;
                        return f.timer > 0;
                    });

                    spawnTrainsBasedOnTimetable();

                    const { trains, failures } = simState.current;
                    const newMas: Record<string, number> = {};

                    const sortedTrains = [...trains].sort((a, b) => a.position - b.position);
                    const getLeadingTrain = (train: Train) => {
                        const idx = sortedTrains.findIndex(t => t.id === train.id);
                        return sortedTrains[(idx + 1) % sortedTrains.length];
                    };

                    trains.forEach(train => {
                        // 1. Station Logic
                        let serviceLimit = train.maxSpeed;
                        if (train.nextStop !== null) {
                            let distToStop = (train.nextStop - train.position + LOOP_LENGTH) % LOOP_LENGTH;
                            
                            if (distToStop > LOOP_LENGTH - 10) {
                                distToStop = 0;
                                train.position = train.nextStop;
                            }

                            if (distToStop < 0.5 && train.speed < 0.5 && train.dwellTimer <= 0) {
                                train.speed = 0;
                                train.dwellTimer = 30; // 30s dwell
                                
                                const currentStopIdx = STOPS.indexOf(train.nextStop);
                                train.nextStop = STOPS[(currentStopIdx + 1) % STOPS.length];
                            }

                            const serviceDecel = 1.0;
                            serviceLimit = Math.sqrt(2 * serviceDecel * Math.max(0, distToStop));
                        }

                        // 2. ZC Logic
                        const leading = getLeadingTrain(train);
                        let maDist = zc.current.calculateMADistance(train, leading, LOOP_LENGTH);

                        let minFailureDist = Infinity;
                        failures.forEach(f => {
                            const fDist = (f.s - train.position + LOOP_LENGTH) % LOOP_LENGTH;
                            if (fDist > 0 && fDist < LOOP_LENGTH / 2 && fDist < minFailureDist) {
                                minFailureDist = fDist;
                            }
                        });
                        
                        if (minFailureDist !== Infinity) {
                            maDist = Math.max(0, Math.min(maDist, minFailureDist - 10)); // 10m buffer to stop right before it
                        }

                        newMas[train.id] = maDist;

                        // 3. ATP Logic
                        let effectiveMaDist = maDist;
                        let margin = 50;
                        let distToStop = Infinity;
                        if (train.nextStop !== null) {
                            distToStop = (train.nextStop - train.position + LOOP_LENGTH) % LOOP_LENGTH;
                            if (distToStop < maDist) {
                                effectiveMaDist = distToStop;
                                margin = 0; // No safety margin needed for station stop
                            }
                        }
                        
        // ATP sets targetSpeed based on Civil Limits and enforces EB
                        const isStationStop = distToStop < maDist;
                        atp.current.monitor(train, effectiveMaDist, LOOP_LENGTH, margin, isStationStop);
                        
                        // Calculate Advisory Speed
                        const serviceDecel = 1.0;
                        let advisoryLimit = Math.sqrt(2 * serviceDecel * Math.max(0, effectiveMaDist - margin));
                        
                        // Advisory speed cannot exceed target speed
                        train.advisorySpeed = Math.min(advisoryLimit, train.targetSpeed);

                        // 4. Dynamics
                        train.move(cycleTime, getGrade(train.position), LOOP_LENGTH);
                    });

                    simState.current.mas = newMas;

                    // --- Record log entry every LOG_INTERVAL_SEC sim-seconds ---
                    const clock = simState.current.clockTime;
                    if (clock - lastLogClockRef.current >= LOG_INTERVAL_SEC) {
                        lastLogClockRef.current = clock;
                        simState.current.trains.forEach(train => {
                            const pos = getPosFromS(train.position);
                            logRef.current.push({
                                simTime: formatSimTime(clock),
                                trainId: train.id,
                                line: pos.line,
                                chainage: pos.chainage,
                                positionM: train.position,
                                speedKmh: train.speed * 3.6,
                                accelMs2: train.acceleration,
                                targetSpeedKmh: train.targetSpeed * 3.6,
                                advisorySpeedKmh: train.advisorySpeed * 3.6,
                                mode: train.mode,
                                emergencyBrake: train.emergencyBrake ? 'YES' : 'NO',
                                maDistM: newMas[train.id] ?? 0,
                                dwellTimer: train.dwellTimer,
                            });
                        });
                    }

                    accumulatorRef.current -= cycleTime;
                }
                forceUpdate({});
            }
            requestRef.current = requestAnimationFrame(loop);
        };

        requestRef.current = requestAnimationFrame(loop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [paused]);

    const getLog = useCallback(() => logRef.current, []);
    const clearLog = useCallback(() => {
        logRef.current = [];
        lastLogClockRef.current = simState.current.clockTime;
    }, []);

    return { 
        paused, 
        setPaused, 
        initSimulation, 
        loadTimetable, 
        trains: simState.current.trains, 
        mas: simState.current.mas, 
        clockTime: simState.current.clockTime,
        failures: simState.current.failures,
        addFailure,
        getLog,
        clearLog
    };
}
