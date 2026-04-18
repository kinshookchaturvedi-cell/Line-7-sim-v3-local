import React, { useEffect, useRef, useState } from 'react';
import { Train } from '../lib/simulator';
import { LOOP_LENGTH, shortNames, chainages, getPosFromS, getSFromChainage } from '../hooks/useSimulation';

interface Props { 
    trains: Train[]; 
    mas: Record<string, number>; 
    failures: {id: string, s: number, timer: number}[];
    addFailure: (s: number, durationMins: number) => void;
}

export const SimulationCanvas: React.FC<Props> = ({ trains, mas, failures, addFailure }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isSimulatingFailure, setIsSimulatingFailure] = useState(false);
    const [hoverData, setHoverData] = useState<{x: number, y: number, chainage: number, line: string, s: number} | null>(null);
    const [failureModal, setFailureModal] = useState<{show: boolean, s: number, chainage: number, line: string}>({show: false, s: 0, chainage: 0, line: ''});
    const [failureDuration, setFailureDuration] = useState(5);
    const trackInfoRef = useRef({ startX: 0, widthPx: 0, topY: 0, bottomY: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const trackYTop = height / 2 - 20;
        const trackYBottom = height / 2 + 20;
        const trackStartX = width * 0.05;
        const trackEndX = width * 0.95;
        const trackWidthPx = trackEndX - trackStartX;
        
        trackInfoRef.current = { startX: trackStartX, widthPx: trackWidthPx, topY: trackYTop, bottomY: trackYBottom };

        const getXY = (pos: number) => {
            const mapped = getPosFromS(pos);
            const { chainage, line } = mapped;
            
            const physicalX = trackStartX + (chainage / 8420) * trackWidthPx;
            
            let isTop = true;
            let y = trackYTop;
            
            if (line === 'DN') {
                isTop = true;
                y = trackYTop;
            } else if (line === 'UP') {
                isTop = false;
                y = trackYBottom;
            } else if (line === 'CROSS_DN_UP_FWD') {
                const progress = (chainage - 8100) / 80;
                y = trackYTop + progress * (trackYBottom - trackYTop);
                isTop = progress < 0.5;
            } else if (line === 'CROSS_UP_DN_REV') {
                const progress = (1095 - chainage) / 80;
                y = trackYBottom - progress * (trackYBottom - trackYTop);
                isTop = progress > 0.5;
            }
            
            return { x: physicalX, y, isTop };
        };

        const getPhysicalX = (chainage: number) => trackStartX + (chainage / 8420) * trackWidthPx;

        const getSignalAspect = (signalPos: number) => {
            let aspect = '#2ECC71';
            for (const train of trains) {
                const distFront = (train.position - signalPos + LOOP_LENGTH) % LOOP_LENGTH;
                if (distFront >= 0 && distFront <= 500 + train.length) {
                    return '#E74C3C';
                }
            }
            return aspect;
        };

        const drawSignalAt = (pos: number) => {
            const { x, y, isTop } = getXY(pos);
            const aspect = getSignalAspect(pos);
            
            ctx.fillStyle = aspect;
            ctx.beginPath();
            const yOffset = isTop ? -12 : 12; 
            ctx.arc(x, y + yOffset, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.strokeStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(x, y + yOffset + (isTop ? 4 : -4));
            ctx.lineTo(x, y + (isTop ? -2 : 2));
            ctx.stroke();
        };

        const drawCrossoverAtPhysical = (x: number) => {
            const cw = 40; 
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - cw/2, trackYTop);
            ctx.lineTo(x + cw/2, trackYBottom);
            ctx.moveTo(x + cw/2, trackYTop);
            ctx.lineTo(x - cw/2, trackYBottom);
            ctx.stroke();
            
            ctx.fillStyle = '#F39C12'; // Orange/Yellow
            const pmSize = 6;
            ctx.fillRect(x - cw/2 - pmSize/2, trackYTop - pmSize/2, pmSize, pmSize);
            ctx.fillRect(x + cw/2 - pmSize/2, trackYTop - pmSize/2, pmSize, pmSize);
            ctx.fillRect(x - cw/2 - pmSize/2, trackYBottom - pmSize/2, pmSize, pmSize);
            ctx.fillRect(x + cw/2 - pmSize/2, trackYBottom - pmSize/2, pmSize, pmSize);
        };
        
        const drawScissorCrossoverAtLogical = (startPos: number, endPos: number) => {
            const startX = getPhysicalX(startPos);
            const endX = getPhysicalX(endPos);
            
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startX, trackYTop);
            ctx.lineTo(endX, trackYBottom);
            ctx.moveTo(endX, trackYTop);
            ctx.lineTo(startX, trackYBottom);
            ctx.stroke();
            
            ctx.fillStyle = '#F39C12'; // Orange/Yellow
            const pmSize = 6;
            ctx.fillRect(startX - pmSize/2, trackYTop - pmSize/2, pmSize, pmSize);
            ctx.fillRect(endX - pmSize/2, trackYTop - pmSize/2, pmSize, pmSize);
            ctx.fillRect(startX - pmSize/2, trackYBottom - pmSize/2, pmSize, pmSize);
            ctx.fillRect(endX - pmSize/2, trackYBottom - pmSize/2, pmSize, pmSize);
        };

        // 1. Draw Tracks
        ctx.fillStyle = '#ccc';
        ctx.fillRect(trackStartX, trackYTop - 1, trackWidthPx, 2);
        ctx.fillRect(trackStartX, trackYBottom - 1, trackWidthPx, 2);

        // Draw Line Labels
        ctx.fillStyle = '#666';
        ctx.font = 'bold 14px var(--f-sans)';
        ctx.textAlign = 'center';
        ctx.fillText("DN Line \u2192", trackStartX + trackWidthPx / 2, trackYTop - 40); // User asked to swap labels
        ctx.fillText("\u2190 UP Line", trackStartX + trackWidthPx / 2, trackYBottom + 50);

        // 3. Draw Crossovers
        drawScissorCrossoverAtLogical(1015, 1095); // UP to DN 1055
        drawScissorCrossoverAtLogical(4460, 4540); // Mid requested
        drawScissorCrossoverAtLogical(8100, 8180); // DN to UP 8140

        // 4. Draw Crossover Signals (Protecting point machines)
        const drawSignalAtPhysical = (chainage: number, y: number, isTop: boolean) => {
            const x = getPhysicalX(chainage);
            ctx.fillStyle = '#2ECC71'; // Normally Green
            ctx.beginPath();
            const yOffset = isTop ? -12 : 12; 
            ctx.arc(x, y + yOffset, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.strokeStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(x, y + yOffset + (isTop ? 4 : -4));
            ctx.lineTo(x, y + (isTop ? -2 : 2));
            ctx.stroke();
        };

        // DN moving right
        drawSignalAtPhysical(1005, trackYTop, true);
        drawSignalAtPhysical(4450, trackYTop, true);
        drawSignalAtPhysical(8090, trackYTop, true);
        
        // UP moving left
        drawSignalAtPhysical(1105, trackYBottom, false);
        drawSignalAtPhysical(4550, trackYBottom, false);
        drawSignalAtPhysical(8190, trackYBottom, false);

        // 5. Draw Stations (no signals here)
        chainages.forEach((st) => {
            const x = getPhysicalX(st.c);
            const stationWidthPx = (74 / 8420) * trackWidthPx;
            const shortName = shortNames[st.name] || st.name;

            // DN platform
            ctx.fillStyle = '#bbb';
            ctx.fillRect(x - stationWidthPx / 2, trackYTop - 6, stationWidthPx, 12);
            ctx.fillStyle = '#555';
            ctx.font = '10px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(shortName + " DN", x, trackYTop - 15);
            
            // UP platform
            ctx.fillStyle = '#bbb';
            ctx.fillRect(x - stationWidthPx / 2, trackYBottom - 6, stationWidthPx, 12);
            ctx.fillStyle = '#555';
            ctx.fillText(shortName + " UP", x, trackYBottom + 22);
        });

        // 6. Draw MAs and Trains
        trains.forEach((train, index) => {
            const { x, y, isTop } = getXY(train.position);

            const maDist = mas[train.id];
            if (maDist !== undefined) {
                ctx.strokeStyle = train.color;
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = 3;
                ctx.beginPath();
                
                const numMaSegments = Math.ceil(maDist / 50);
                for (let i = 0; i <= numMaSegments; i++) {
                    const p = (train.position + Math.min(i * 50, maDist)) % LOOP_LENGTH;
                    const { x: px, y: py, isTop: pIsTop } = getXY(p);
                    const yOffset = pIsTop ? -16 : 16;
                    if (i === 0) ctx.moveTo(px, py + yOffset);
                    else ctx.lineTo(px, py + yOffset);
                }
                ctx.stroke();

                // Draw LMA (Limit of Movement Authority) Tick mark
                const limitPos = (train.position + maDist) % LOOP_LENGTH;
                const { x: lx, y: ly, isTop: lIsTop } = getXY(limitPos);
                const lYOffset = lIsTop ? -16 : 16;
                ctx.beginPath();
                ctx.moveTo(lx, ly + lYOffset - 6);
                ctx.lineTo(lx, ly + lYOffset + 6);
                ctx.lineWidth = 4;
                ctx.stroke();
                
                ctx.globalAlpha = 1.0;
            }

            // Train Body
            ctx.strokeStyle = train.color;
            ctx.lineWidth = 14;
            ctx.lineCap = 'round';
            ctx.beginPath();
            
            const trainLengthPx = (train.length / 8420) * trackWidthPx;
            let currentLogicalPos = train.position;
            let { x: currentX, y: currentY } = getXY(currentLogicalPos);
            ctx.moveTo(currentX, currentY);

            let accumulatedPx = 0;
            const stepLogical = 2; // 2 meters step for smooth bending
            let steps = 0;
            
            while (accumulatedPx < trainLengthPx && steps < 200) {
                const nextLogicalPos = (currentLogicalPos - stepLogical + LOOP_LENGTH) % LOOP_LENGTH;
                const { x: nextX, y: nextY } = getXY(nextLogicalPos);
                const dist = Math.hypot(nextX - currentX, nextY - currentY);
                
                if (dist > 0) {
                    if (accumulatedPx + dist > trainLengthPx) {
                        const ratio = (trainLengthPx - accumulatedPx) / dist;
                        const finalX = currentX + (nextX - currentX) * ratio;
                        const finalY = currentY + (nextY - currentY) * ratio;
                        ctx.lineTo(finalX, finalY);
                        break;
                    } else {
                        ctx.lineTo(nextX, nextY);
                        accumulatedPx += dist;
                    }
                }
                currentX = nextX;
                currentY = nextY;
                currentLogicalPos = nextLogicalPos;
                steps++;
            }
            ctx.stroke();
            
            // Train ID - drawn with text over the train
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(train.id, x + (isTop ? 10 : -10), y + 3);

            // Emergency Brake Indicator
            if (train.emergencyBrake) {
                ctx.fillStyle = '#E74C3C';
                ctx.beginPath();
                ctx.arc(x, y - 15, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // 7. Draw Failures
        failures.forEach(f => {
            const { x, y } = getXY(f.s);
            ctx.fillStyle = '#E74C3C';
            // Draw a red solid cross
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 6);
            ctx.lineTo(x + 6, y + 6);
            ctx.moveTo(x + 6, y - 6);
            ctx.lineTo(x - 6, y + 6);
            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // Text for failure duration
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 9px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(`FAIL ${Math.ceil(f.timer / 60)}m`, x, y - 10);
        });

    }, [trains, mas, failures]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSimulatingFailure) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { startX, widthPx, topY, bottomY } = trackInfoRef.current;
        const normalizedX = Math.max(0, Math.min(x - startX, widthPx));
        let chainageEstimate = (normalizedX / widthPx) * 8420;
        
        let line = 'DN';
        let direction: 1 | -1 = 1;
        if (Math.abs(y - topY) < Math.abs(y - bottomY)) {
            line = 'DN';
            direction = 1;
            chainageEstimate = Math.max(1095, Math.min(chainageEstimate, 8253.542));
        } else {
            line = 'UP';
            direction = -1;
            chainageEstimate = Math.max(500, Math.min(chainageEstimate, 8100));
        }

        const s = getSFromChainage(chainageEstimate, line as 'DN'|'UP', direction);
        setHoverData({ x, y, chainage: chainageEstimate, line, s });
    };

    const handleMouseClick = () => {
        if (!isSimulatingFailure || !hoverData) return;
        setFailureModal({ show: true, s: hoverData.s, chainage: hoverData.chainage, line: hoverData.line });
        setIsSimulatingFailure(false);
        setHoverData(null);
    };

    return (
        <div className="relative w-full h-full bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-gray-300 text-2xl font-bold uppercase tracking-widest pointer-events-none">
                DMRC Line 11
            </div>

            <button 
                onClick={() => setIsSimulatingFailure(!isSimulatingFailure)}
                className={`absolute top-4 right-4 z-10 px-4 py-2 rounded font-bold text-xs uppercase tracking-wider transition-colors ${isSimulatingFailure ? 'bg-red-600 text-white shadow-inner flex items-center gap-2' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 shadow'}`}
            >
                {isSimulatingFailure ? (
                    <>
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                        Cancel Selection
                    </>
                ) : 'Simulate Failure'}
            </button>
            
            <canvas 
                ref={canvasRef} 
                className={`w-full h-full ${isSimulatingFailure ? 'cursor-crosshair' : 'cursor-default'}`} 
                style={{ display: 'block' }} 
                onMouseMove={handleMouseMove}
                onClick={handleMouseClick}
                onMouseLeave={() => setHoverData(null)}
            />

            {hoverData && isSimulatingFailure && (
                <div 
                    className="absolute bg-black text-white text-xs font-mono px-2 py-1 rounded pointer-events-none shadow-lg z-20 whitespace-nowrap transform -translate-x-1/2 -translate-y-full"
                    style={{ left: hoverData.x, top: hoverData.y - 15 }}
                >
                    {hoverData.line} LINE - CH: {hoverData.chainage.toFixed(1)}m<br/>
                    <span className="text-gray-400 text-[10px]">Click to set failure</span>
                </div>
            )}

            {failureModal.show && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-[350px]">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 mt-0">Confirm Point Failure</h3>
                        <p className="text-sm text-gray-600 mb-4 whitespace-nowrap">
                            Line: <strong className="text-gray-900">{failureModal.line}</strong><br/>
                            Chainage: <strong className="text-gray-900">{failureModal.chainage.toFixed(1)}m</strong>
                        </p>
                        
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Duration (Minutes)</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="60" 
                                value={failureDuration} 
                                onChange={e => setFailureDuration(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex justify-end gap-3 font-medium">
                            <button 
                                onClick={() => setFailureModal({ show: false, s: 0, chainage: 0, line: '' })}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    addFailure(failureModal.s, failureDuration);
                                    setFailureModal({ show: false, s: 0, chainage: 0, line: '' });
                                }}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors shadow-sm text-sm"
                            >
                                Trigger Failure
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
