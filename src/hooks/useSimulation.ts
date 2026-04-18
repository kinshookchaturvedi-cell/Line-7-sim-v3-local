import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { Train, ZoneController, ATPModule } from '../lib/simulator';
import type { LogEntry } from '../lib/exportReport';

export const LOOP_LENGTH = 143120; // 71560 * 2 (DN and UP)

export interface StationArrival { trainId: string; stationChainage: number; time: number; }
export interface TripLog { trainId: string; startTime: number; endTime: number; duration: number; delay: number; }


export const shortNames: Record<string, string> = {
    "Majlis Park": "MJP",
    "Azadpur": "AZP",
    "Shalimar Bagh": "SLB",
    "Netaji Subhash Place": "NSP",
    "Shakurpur": "SKP",
    "Punjabi Bagh West": "PBW",
    "ESI - Basaidarapur": "ESI",
    "Rajouri Garden": "RJG",
    "Mayapuri": "MPR",
    "Naraina Vihar": "NVH",
    "Delhi Cantt.": "DNC",
    "D.D. South Campus": "DDS",
    "Moti Bagh": "SMB",
    "Bhikaji Cama Place": "BCP",
    "Sarojini Nagar": "SJN",
    "Dilli Haat - INA": "INA",
    "South Extension": "SXN",
    "Lajpat Nagar": "LPN",
    "Vinobapuri": "VBP",
    "Ashram": "ASM",
    "SKK - Nizamuddin": "SKN",
    "Mayur Vihar - I": "MV1",
    "Shree Ram Mandir": "SMM",
    "Trilokpuri-Sanjay Lake": "TSL",
    "E. Vinod Nagar-MV II": "EV2",
    "Mandawali-W. Vinod Nagar": "WVN",
    "I.P. Extension": "IPE",
    "Anand Vihar ISBT": "AVN",
    "Karkarduma": "KKD",
    "Karkarduma Court": "KKC",
    "Krishna Nagar": "KNA",
    "East Azad Nagar": "EAN",
    "Welcome": "WLC",
    "Jafrabad": "JFD",
    "Maujpur-Babarpur": "MJB",
    "Gokulpuri": "GKP",
    "Johri Enclave": "JRE",
    "Shiv Vihar": "SVH",
    "Yamuna Vihar": "YV",
    "Bhajanpura": "BJP",
    "Khajuri Khas": "KKH",
    "Sonia Vihar": "SNV",
    "Soorghat": "SGT",
    "Jagatpur-Wazirabad": "JWZ",
    "Jharoda Majra": "JRM",
    "Burari": "BUI"
};

export const chainages = [
    { name: "Majlis Park", c: 0 },
    { name: "Azadpur", c: 1550 },
    { name: "Shalimar Bagh", c: 3009 },
    { name: "Netaji Subhash Place", c: 4244 },
    { name: "Shakurpur", c: 5215 },
    { name: "Punjabi Bagh West", c: 6685 },
    { name: "ESI - Basaidarapur", c: 8411 },
    { name: "Rajouri Garden", c: 9324 },
    { name: "Mayapuri", c: 10571 },
    { name: "Naraina Vihar", c: 11886 },
    { name: "Delhi Cantt.", c: 13312 },
    { name: "D.D. South Campus", c: 16468 },
    { name: "Moti Bagh", c: 17589 },
    { name: "Bhikaji Cama Place", c: 18914 },
    { name: "Sarojini Nagar", c: 19960 },
    { name: "Dilli Haat - INA", c: 20992 },
    { name: "South Extension", c: 22152 },
    { name: "Lajpat Nagar", c: 23589 },
    { name: "Vinobapuri", c: 24828 },
    { name: "Ashram", c: 25848 },
    { name: "SKK - Nizamuddin", c: 27324 },
    { name: "Mayur Vihar - I", c: 30537 },
    { name: "Shree Ram Mandir", c: 31377 },
    { name: "Trilokpuri-Sanjay Lake", c: 32520 },
    { name: "E. Vinod Nagar-MV II", c: 33189 },
    { name: "Mandawali-W. Vinod Nagar", c: 33640 },
    { name: "I.P. Extension", c: 34483 },
    { name: "Anand Vihar ISBT", c: 35901 },
    { name: "Karkarduma", c: 36799 },
    { name: "Karkarduma Court", c: 37823 },
    { name: "Krishna Nagar", c: 38450 },
    { name: "East Azad Nagar", c: 39235 },
    { name: "Welcome", c: 40131 },
    { name: "Jafrabad", c: 41153 },
    { name: "Maujpur-Babarpur", c: 42112 },
    { name: "Gokulpuri", c: 43212 },
    { name: "Johri Enclave", c: 44412 },
    { name: "Shiv Vihar", c: 45312 },
    { name: "Yamuna Vihar", c: 46190 }, 
    { name: "Bhajanpura", c: 47150 },
    { name: "Khajuri Khas", c: 48450 },
    { name: "Sonia Vihar", c: 50000 },
    { name: "Soorghat", c: 51600 },
    { name: "Jagatpur-Wazirabad", c: 53200 },
    { name: "Jharoda Majra", c: 55100 },
    { name: "Burari", c: 57500 }
];

export const getPosFromS = (s: number) => {
    s = ((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
    if (s <= 71560) {
        return { line: 'DN', chainage: s, dir: 1 };
    } else {
        return { line: 'UP', chainage: 71560 - (s - 71560), dir: -1 };
    }
};

export const getSFromChainage = (ch: number, line: 'DN' | 'UP', dir: 1 | -1) => {
    if (line === 'DN') return ch;
    return 71560 + (71560 - ch);
};

export const STOPS: number[] = [];
chainages.forEach((st) => {
    STOPS.push(st.c); // DN
    STOPS.push(71560 + (71560 - st.c)); // UP
});
STOPS.sort((a, b) => a - b);
STOPS.push(0);

export function useSimulation(simSpeedRef: MutableRefObject<number>) {
    const [paused, setPaused] = useState(true);
    const [, forceUpdate] = useState({});
    
    const requestRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);
    const accumulatorRef = useRef<number>(0);

    const zc = useRef(new ZoneController(200));
    const atp = useRef(new ATPModule(1.0));

    const logRef = useRef<LogEntry[]>([]);
    const lastLogClockRef = useRef<number>(6 * 3600);
    const LOG_INTERVAL_SEC = 30;

    const stationArrivalsRef = useRef<StationArrival[]>([]);
    const tripTrackingRef = useRef<Record<string, { startTime: number, completedTrips: number }>>({});
    const completedTripsRef = useRef<TripLog[]>([]);

    const formatSimTime = (sec: number) => {
        const h = Math.floor(sec / 3600).toString().padStart(2, '0');
        const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const simState = useRef<{ trains: Train[], mas: Record<string, number>, clockTime: number, timetable: any[], failures: {id: string, s: number, timer: number}[] }>({
        trains: [],
        mas: {},
        clockTime: 6 * 3600,
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

    const spawnTrainsBasedOnTimetable = () => {
        const time = simState.current.clockTime;
        let newTrains: Train[] = simState.current.trains;
        
        if (time >= 6 * 3600 && time <= 23.25 * 3600) {
            if (simState.current.trains.length < 42) {
                newTrains = [];
                const spacing = LOOP_LENGTH / 42;
                const cols = ['#e91e63', '#ec407a', '#f48fb1', '#c2185b', '#f06292', '#ad1457'];
                for (let i = 0; i < 42; i++) {
                    const pos = i * spacing;
                    const t = new Train(`T${i+1}`, pos, 0, cols[i % cols.length], 70);
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
        simState.current.trains = newTrains;
    };

    const loadTimetable = (json: any[]) => {};

    const initSimulation = useCallback(() => {
        simState.current.clockTime = 6 * 3600;
        simState.current.trains = [];
        simState.current.mas = {};
        logRef.current = [];
        lastLogClockRef.current = 6 * 3600;
        
        // Reset Telemetry
        stationArrivalsRef.current = [];
        completedTripsRef.current = [];
        tripTrackingRef.current = {};

        spawnTrainsBasedOnTimetable();
        setPaused(true);
        accumulatorRef.current = 0;
        lastTimeRef.current = performance.now();
        forceUpdate({});
    }, []);

    useEffect(() => { initSimulation(); }, [initSimulation]);

    useEffect(() => {
        const cycleTime = 0.5;

        const loop = (time: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const dt = (time - lastTimeRef.current) / 1000;
            lastTimeRef.current = time;

            if (!paused) {
                const clampedDt = Math.min(dt, 0.1);
                accumulatorRef.current += clampedDt * simSpeedRef.current;

                while (accumulatorRef.current >= cycleTime) {
                    simState.current.clockTime += cycleTime;
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
                        let serviceLimit = train.maxSpeed;
                        if (train.nextStop !== null) {
                            let distToStop = (train.nextStop - train.position + LOOP_LENGTH) % LOOP_LENGTH;
                            if (distToStop > LOOP_LENGTH - 10) {
                                distToStop = 0;
                                train.position = train.nextStop;
                            }
                            if (distToStop < 0.5 && train.speed < 0.5 && train.dwellTimer <= 0) {
                                train.speed = 0;
                                train.dwellTimer = 30;

                                // TELEMETRY: Station Arrival Event
                                stationArrivalsRef.current.push({
                                    trainId: train.id,
                                    stationChainage: train.nextStop,
                                    time: simState.current.clockTime
                                });

                                // TELEMETRY: Lap Completion (Chainage 0)
                                if (train.nextStop === 0) {
                                    const tracker = tripTrackingRef.current[train.id];
                                    if (tracker && tracker.startTime > 0) {
                                        const duration = simState.current.clockTime - tracker.startTime;
                                        completedTripsRef.current.push({
                                            trainId: train.id,
                                            startTime: tracker.startTime,
                                            endTime: simState.current.clockTime,
                                            duration: duration,
                                            delay: Math.max(0, duration - 10140) // 10140s = 169m planned trip
                                        });
                                    }
                                    tripTrackingRef.current[train.id] = { 
                                        startTime: simState.current.clockTime, 
                                        completedTrips: (tracker?.completedTrips || 0) + 1 
                                    };
                                }

                                const currentStopIdx = STOPS.indexOf(train.nextStop);
                                train.nextStop = STOPS[(currentStopIdx + 1) % STOPS.length];
                            }
                        }

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
                            maDist = Math.max(0, Math.min(maDist, minFailureDist - 10));
                        }

                        newMas[train.id] = maDist;

                        let effectiveMaDist = maDist;
                        let margin = 50;
                        let distToStop = Infinity;
                        if (train.nextStop !== null) {
                            distToStop = (train.nextStop - train.position + LOOP_LENGTH) % LOOP_LENGTH;
                            if (distToStop < maDist) {
                                effectiveMaDist = distToStop;
                                margin = 0;
                            }
                        }
                        
                        const isStationStop = distToStop < maDist;
                        atp.current.monitor(train, effectiveMaDist, LOOP_LENGTH, margin, isStationStop);
                        
                        const serviceDecel = 1.0;
                        let advisoryLimit = Math.sqrt(2 * serviceDecel * Math.max(0, effectiveMaDist - margin));
                        train.advisorySpeed = Math.min(advisoryLimit, train.targetSpeed);

                        train.move(cycleTime, 0, LOOP_LENGTH);
                    });

                    simState.current.mas = newMas;

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
    const getAnalytics = useCallback(() => ({
        stationArrivals: stationArrivalsRef.current,
        completedTrips: completedTripsRef.current,
        totalTime: Math.max(0, simState.current.clockTime - (6 * 3600))
    }), []);

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
        clearLog,
        getAnalytics
    };
}
