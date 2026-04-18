import React from 'react';
import { Train } from '../lib/simulator';
import { getPosFromS } from '../hooks/useSimulation';

interface DMIProps {
    train: Train;
    maDist: number;
    maxMaDist: number;
}

export const DMI: React.FC<DMIProps> = ({ train, maDist, maxMaDist }) => {
    if (!train) return null;

    // Map coordinate
    const mapped = getPosFromS(train.position);
    let chainageStr = mapped.chainage.toFixed(1);
    let lineStr = mapped.line;

    const actualSpeed = train.speed * 3.6;
    const targetSpeed = train.targetSpeed * 3.6;
    const advisorySpeed = train.advisorySpeed * 3.6;

    const maxSpeedDisplay = 100; // km/h

    // Gauge math, 0 at top (-130 to 130)
    const angleRange = 260; // total arc 260 deg
    const startAngleOffset = -130;

    const speedToAngle = (speed: number) => {
        const clamped = Math.max(0, Math.min(maxSpeedDisplay, speed));
        return startAngleOffset + (clamped / maxSpeedDisplay) * angleRange;
    };

    const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
        const angleRad = (angleDeg - 90) * Math.PI / 180.0;
        return {
            x: cx + r * Math.cos(angleRad),
            y: cy + r * Math.sin(angleRad) // inverted Y because SVG Y goes down
        };
    };

    const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
        const start = polarToCartesian(x, y, radius, endAngle);
        const end = polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M", start.x, start.y, 
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
    };

    const cx = 125;
    const cy = 135;
    const rOuter = 100;

    const backgroundArc = describeArc(cx, cy, rOuter, startAngleOffset, startAngleOffset + angleRange);

    // If targetSpeed < maxSpeedDisplay, we can color the "overspeed" area red
    let overspeedArc = "";
    if (speedToAngle(targetSpeed) < startAngleOffset + angleRange) {
        overspeedArc = describeArc(cx, cy, rOuter, Math.max(startAngleOffset, speedToAngle(targetSpeed)), startAngleOffset + angleRange);
    }

    // Advisory arc
    const advisoryArc = describeArc(cx, cy, rOuter - 15, startAngleOffset, speedToAngle(advisorySpeed));

    // Target arc (outer limit)
    const targetArc = describeArc(cx, cy, rOuter, startAngleOffset, speedToAngle(targetSpeed));

    // Actual speed arc (filled needle-like arc)
    const actualArc = describeArc(cx, cy, rOuter, startAngleOffset, speedToAngle(actualSpeed));

    // Dial marks
    const ticks = [];
    for (let s = 0; s <= maxSpeedDisplay; s += 10) {
        const angle = speedToAngle(s);
        const start = polarToCartesian(cx, cy, rOuter - 5, angle);
        const end = polarToCartesian(cx, cy, rOuter + 5, angle);
        
        ticks.push(
            <line key={`tick-${s}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#555" strokeWidth="2" />
        );
        
        if (s % 20 === 0) {
            const textPos = polarToCartesian(cx, cy, rOuter - 20, angle);
            ticks.push(
                <text key={`text-${s}`} x={textPos.x} y={textPos.y} fill="#999" fontSize="10" textAnchor="middle" alignmentBaseline="middle" fontFamily="monospace">
                    {s}
                </text>
            );
        }
    }

    // Needle
    const needleAngle = speedToAngle(actualSpeed);
    const needleEnd = polarToCartesian(cx, cy, rOuter - 2, needleAngle);

    // Target Marker
    const targetAngle = speedToAngle(targetSpeed);
    const targetMarkerStart = polarToCartesian(cx, cy, rOuter + 6, targetAngle);
    const targetMarkerEnd = polarToCartesian(cx, cy, rOuter - 6, targetAngle);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center mt-2">
                <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Train {train.id} DMI</h2>
            </div>

            <div className="bg-[#111] border border-[#333] rounded-lg p-4 flex flex-col items-center relative shadow-xl overflow-hidden min-h-[300px]">
                {/* Top DMI Info */}
                <div className="w-full flex justify-between items-start text-xs font-mono text-gray-300 mb-2 px-2">
                    <div className="flex flex-col">
                        <span className="text-[#3498db] font-bold text-sm">{train.mode}</span>
                        <span className="text-[9px] text-[#666] tracking-widest">MODE</span>
                    </div>
                    <div className="flex flex-col items-center">
                         <span className="text-white font-bold text-sm tracking-wider flex items-center justify-center"><span className="w-2 h-2 rounded-full mr-2" style={{backgroundColor: train.color}}></span>{lineStr}</span>
                         <span className="text-[9px] text-[#666] tracking-widest">POSITION</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-white font-bold text-sm tracking-wider">{chainageStr}</span>
                        <span className="text-[9px] text-[#666] tracking-widest">CHAINAGE</span>
                    </div>
                </div>

                {/* Gauge */}
                <div style={{ width: 250, height: 210 }} className="relative flex justify-center translate-y-2 transform scale-90 sm:scale-100">
                    <svg viewBox="0 0 250 250" width="100%" height="100%" style={{ overflow: 'visible' }}>
                        {/* Background Arc */}
                        <path d={backgroundArc} fill="none" stroke="#222" strokeWidth="12" strokeLinecap="round" />
                        
                        {/* Target Speed Arc restriction */}
                        {overspeedArc && (
                            <path d={overspeedArc} fill="none" stroke="#600" strokeWidth="12" strokeLinecap="round" opacity={0.6} />
                        )}

                        {/* Advisory Arc (Yellow/Orange) */}
                        <path d={advisoryArc} fill="none" stroke="#f39c12" strokeWidth="6" strokeLinecap="round" />

                        {/* Actual Speed Arc */}
                        <path d={actualArc} fill="none" stroke="#bdc3c7" strokeWidth="12" strokeLinecap="round" opacity={0.3} />

                        {/* Speed ticks */}
                        {ticks}

                        {/* Target Speed Marker */}
                        <line x1={targetMarkerStart.x} y1={targetMarkerStart.y} x2={targetMarkerEnd.x} y2={targetMarkerEnd.y} stroke="#3498db" strokeWidth="4" strokeLinecap="round" />

                        {/* Needle */}
                        <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                        <circle cx={cx} cy={cy} r="6" fill="#fff" />
                        <circle cx={cx} cy={cy} r="3" fill="#111" />
                        
                        {/* Digital Speed Reading centered inside the dial */}
                        <text x={cx} y={cy + 35} fill={actualSpeed > targetSpeed ? "#e74c3c" : "white"} fontSize="32" fontWeight="bold" textAnchor="middle" fontFamily="var(--f-sans)">
                            {actualSpeed.toFixed(0)}
                        </text>
                        <text x={cx} y={cy + 50} fill="#666" fontSize="10" textAnchor="middle" fontFamily="var(--f-sans) tracking-widest">
                            km/h
                        </text>

                        {/* Target digital display */}
                        <text x={cx + 70} y={cy + 75} fill="#3498db" fontSize="14" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                            {targetSpeed.toFixed(0)}
                        </text>
                        <text x={cx + 70} y={cy + 87} fill="#555" fontSize="8" textAnchor="end" fontFamily="monospace">
                            TARGET
                        </text>

                         {/* Advisory display */}
                         <text x={cx - 50} y={cy + 75} fill="#f39c12" fontSize="14" fontWeight="bold" textAnchor="start" fontFamily="monospace">
                            {advisorySpeed.toFixed(0)}
                        </text>
                        <text x={cx - 50} y={cy + 87} fill="#555" fontSize="8" textAnchor="start" fontFamily="monospace">
                            ADVISORY
                        </text>

                        {/* DTG Vertical Bar */}
                        <g transform="translate(5, 35)">
                            <rect x="0" y="0" width="12" height="130" fill="#333" rx="3" />
                            <rect x="0" y={130 - (Math.min(maxMaDist, Math.max(0, maDist)) / maxMaDist) * 130} width="12" height={(Math.min(maxMaDist, Math.max(0, maDist)) / maxMaDist) * 130} fill="#2ecc71" rx="3" />
                            <text x="6" y="145" fill="#666" fontSize="8" textAnchor="middle" fontFamily="monospace">DTG</text>
                            <text x="6" y="-8" fill="#aaa" fontSize="8" textAnchor="middle" fontFamily="monospace">{maxMaDist}</text>
                        </g>
                    </svg>
                </div>

                {/* MA / Next Station display */}
                <div className="w-full bg-[#1a1a1a] shadow-inner p-3 rounded border border-[#2a2a2a] text-xs font-mono text-white flex justify-between items-center whitespace-nowrap z-10 relative mt-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-[#666] text-[9px] tracking-widest">MOVEMENT AUTH</span>
                        <span className="text-[#2ecc71] font-bold text-sm tracking-wider">{maDist.toFixed(0)} m</span>
                    </div>
                     <div className="flex flex-col gap-1 items-end">
                        <span className="text-[#666] text-[9px] tracking-widest">DOORS</span>
                        <span className={train.dwellTimer > 0 ? "text-[#f1c40f] font-bold text-sm shadow-[#f1c40f]" : "text-[#555] text-sm"}>{train.dwellTimer > 0 ? `OPEN` : 'CLOSED'}</span>
                    </div>
                </div>

                {train.emergencyBrake && (
                    <div className="absolute inset-0 bg-[#e74c3c] bg-opacity-[0.15] border-[3px] border-[#e74c3c] rounded-lg pointer-events-none flex items-center justify-center z-20">
                        <span className="text-white font-bold text-lg tracking-widest bg-[#e74c3c] px-4 py-2 rounded shadow-2xl animate-pulse text-center">EMERGENCY<br/>BRAKE</span>
                    </div>
                )}
            </div>
        </div>
    );
};

