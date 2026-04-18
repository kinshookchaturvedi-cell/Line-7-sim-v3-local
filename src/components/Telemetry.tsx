import React from 'react';
import { Train } from '../lib/simulator';
import { LOOP_LENGTH, shortNames, chainages, getPosFromS } from '../hooks/useSimulation';

interface Props {
    train: Train;
    maDist: number;
}

const TelemetryCard = ({ label, value, valueNode }: { label: string, value?: string | number, valueNode?: React.ReactNode }) => (
    <div className="bg-white p-4 flex flex-col justify-center">
        <div className="text-[0.65rem] text-gray-500 uppercase mb-1">{label}</div>
        <div className="font-mono text-lg font-bold text-gray-900 leading-tight">
            {valueNode || value}
        </div>
    </div>
);

export const Telemetry: React.FC<Props> = ({ train, maDist }) => {
    const posObj = getPosFromS(train.position);
    const lineName = posObj.line;
    
    // Find closest station
    let nextStationStr = "N/A";
    if (train.nextStop) {
         let nStopObj = getPosFromS(train.nextStop);
         const foundStation = chainages.find(st => Math.abs(st.c - nStopObj.chainage) < 5);
         nextStationStr = foundStation ? shortNames[foundStation.name] || foundStation.name : "N/A";
    }

    let status = 'COASTING';
    let statusColor = '#95A5A6';
    
    // Check if train is stopping at a platform
    const distToStop = train.nextStop !== null ? (train.nextStop - train.position + LOOP_LENGTH) % LOOP_LENGTH : Infinity;
    const isStoppingAtPlatform = distToStop < 200 && train.speed < 15;

    let displayAccel = train.acceleration;

    if (train.dwellTimer > 0) {
        status = `DWELLING (${Math.ceil(train.dwellTimer)}s)`;
        statusColor = '#F39C12';
        displayAccel = 0;
    } else if (train.emergencyBrake && !isStoppingAtPlatform) {
        status = 'EMERGENCY BRAKE';
        statusColor = 'var(--accent-red)';
    } else if (train.acceleration > 0.05) {
        status = 'ACCELERATING';
        statusColor = 'var(--accent-green)';
    } else if (train.acceleration < -0.05) {
        status = 'BRAKING';
        statusColor = 'var(--accent-red)';
    } else {
        displayAccel = 0; // Force to 0 during coasting
    }

    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-gray-900">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: train.color }}></span>
                Train {train.id}
            </h3>
            <div className="grid grid-cols-5 gap-[1px] bg-gray-200 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <TelemetryCard label="Line" value={lineName} />
                <TelemetryCard label="Position" value={`${posObj.chainage.toFixed(1)} m`} />
                <TelemetryCard label="Speed" value={`${(train.speed * 3.6).toFixed(1)} km/h`} />
                <TelemetryCard label="Target Speed" value={`${(train.targetSpeed * 3.6).toFixed(1)} km/h`} />
                <TelemetryCard label="Advisory Speed" value={`${(train.advisorySpeed * 3.6).toFixed(1)} km/h`} />
                
                <TelemetryCard label="Mode" value={train.mode} />
                <TelemetryCard label="Accel / Decel" value={`${displayAccel > 0 ? '+' : ''}${displayAccel.toFixed(2)} m/s²`} />
                <TelemetryCard label="Next Station" valueNode={
                    <>
                        <div className="font-sans text-sm font-semibold text-gray-900 mb-[2px]">{nextStationStr}</div>
                        <div>{train.nextStop !== null ? `${getPosFromS(train.nextStop).chainage.toFixed(1)} m` : 'N/A'}</div>
                    </>
                } />
                <TelemetryCard label="Movement Authority" value={`${maDist.toFixed(1)} m`} />
                <TelemetryCard label="Status" valueNode={
                    <div className="flex items-center text-sm sm:text-base">
                        <span className="inline-block w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: statusColor }}></span>
                        <span className="truncate">{status}</span>
                    </div>
                } />
            </div>
        </div>
    );
}
