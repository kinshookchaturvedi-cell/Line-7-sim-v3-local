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
    const trackInfoRef = useRef({ startX: 0, widthPx: 0 });

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

        // Ebiscreen background color
        ctx.fillStyle = '#c4c6c6';
        ctx.fillRect(0, 0, width, height);

        const trackStartX = width * 0.05;
        const trackEndX = width * 0.95;
        const trackWidthPx = trackEndX - trackStartX;
        
        trackInfoRef.current = { startX: trackStartX, widthPx: trackWidthPx };

        const NUM_ROWS = 3;
        const MAX_CHAINAGE = 71560; // 71.56km
        const rowWidth = MAX_CHAINAGE / NUM_ROWS;
        const rowHeight = height / NUM_ROWS;

        const getXY = (pos: number) => {
            const mapped = getPosFromS(pos);
            const { chainage, line } = mapped;
            
            const rowIndex = Math.min(NUM_ROWS - 1, Math.floor(chainage / rowWidth));
            const progressInRow = (chainage - rowIndex * rowWidth) / rowWidth;
            
            const isLeftToRight = rowIndex % 2 === 0;
            const xProgress = isLeftToRight ? progressInRow : (1 - progressInRow);
            
            const physicalX = trackStartX + xProgress * trackWidthPx;
            
            const cy = rowHeight * rowIndex + rowHeight / 2;
            let isTop = true;
            let y = cy - 20;
            
            if (line === 'DN') {
                isTop = true;
                y = cy - 15;
            } else if (line === 'UP') {
                isTop = false;
                y = cy + 15;
            } 
            
            return { x: physicalX, y, isTop };
        };

        const getPhysicalX = (chainage: number) => {
            const rowIndex = Math.min(NUM_ROWS - 1, Math.floor(chainage / rowWidth));
            const progressInRow = (chainage - rowIndex * rowWidth) / rowWidth;
            const isLeftToRight = rowIndex % 2 === 0;
            const xProgress = isLeftToRight ? progressInRow : (1 - progressInRow);
            return trackStartX + xProgress * trackWidthPx;
        };

        const getCyForRow = (rowIndex: number) => rowHeight * rowIndex + rowHeight / 2;

        // Drawing Tracks (Ebiscreen style: top thick yellow, bottom thick green)
        for (let i = 0; i < NUM_ROWS; i++) {
            const cy = getCyForRow(i);
            
            // DN Track - Yellow
            ctx.fillStyle = '#ffeb3b';
            ctx.fillRect(trackStartX, cy - 18, trackWidthPx, 4);
            
            // UP Track - Green
            ctx.fillStyle = '#00e676';
            ctx.fillRect(trackStartX, cy + 13, trackWidthPx, 4);

            // Row Labels
            ctx.fillStyle = '#555';
            ctx.font = 'bold 9px var(--f-sans)';
            ctx.textAlign = 'center';
            
            const dirLabel = i % 2 === 0 ? "→" : "←";
            const dirLabelUp = i % 2 === 0 ? "←" : "→";

            ctx.fillText(`DN Line ${dirLabel}`, trackStartX + trackWidthPx / 2, cy - 28);
            ctx.fillText(`${dirLabelUp} UP Line`, trackStartX + trackWidthPx / 2, cy + 32);
        }

        // Draw curved connections mimicking track continuation
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(trackEndX, (getCyForRow(0) + getCyForRow(1))/2 - 1, (getCyForRow(1) - getCyForRow(0))/2, -Math.PI/2, Math.PI/2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(trackStartX, (getCyForRow(1) + getCyForRow(2))/2 - 1, (getCyForRow(2) - getCyForRow(1))/2, Math.PI/2, Math.PI * 1.5);
        ctx.stroke();

        // 5. Draw Stations (Ebiscreen white rect with black text border above tracks)
        chainages.forEach((st) => {
            const rowIndex = Math.min(NUM_ROWS - 1, Math.floor(st.c / rowWidth));
            const x = getPhysicalX(st.c);
            const cy = getCyForRow(rowIndex);

            const stationWidthPx = (80 / MAX_CHAINAGE) * trackWidthPx * NUM_ROWS;
            const shortName = shortNames[st.name] || st.name;

            // Draw Station Marker
            ctx.fillStyle = '#e8e8e8'; 
            ctx.fillRect(x - stationWidthPx/2, cy - 42, stationWidthPx, 14);
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - stationWidthPx/2, cy - 42, stationWidthPx, 14);

            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(shortName, x, cy - 32);
            
            // Connect to tracks
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(x, cy - 28);
            ctx.lineTo(x, cy + 13);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        // Loop End/Start Crossovers (Scissors at Maujpur, Doubles at ends)
        const drawCrossover = (ch: number, type: 'SCISSORS' | 'DOUBLE' | 'SINGLE') => {
            const x = getPhysicalX(ch);
            const rowIndex = Math.min(NUM_ROWS - 1, Math.floor(ch / rowWidth));
            const cy = getCyForRow(rowIndex);
            
            const cw = type === 'SCISSORS' ? 12 : 8; 
            ctx.strokeStyle = '#ffeb3b'; // Yellow crossovers
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x - cw, cy - 16);
            ctx.lineTo(x + cw, cy + 15);
            if (type !== 'SINGLE') {
                ctx.moveTo(x + cw, cy - 16);
                ctx.lineTo(x - cw, cy + 15);
            }
            if (type === 'DOUBLE') {
                ctx.moveTo(x - cw - 15, cy - 16);
                ctx.lineTo(x + cw - 15, cy + 15);
                ctx.moveTo(x + cw - 15, cy - 16);
                ctx.lineTo(x - cw - 15, cy + 15);
            }
            ctx.stroke();

            // Interlocking Point Machine Markers [P-XXXX]
            ctx.fillStyle = '#666';
            ctx.fillRect(x - 3, cy - 3, 6, 6);
            ctx.fillStyle = '#333';
            ctx.font = 'bold 7px var(--f-sans)';
            ctx.textAlign = 'center';
            const pId = 'P' + (Math.floor(ch/100) + 200).toString().padStart(4, '0');
            ctx.fillText(pId, x, cy + 8);
        };

        drawCrossover(120, 'DOUBLE'); // Majlis
        drawCrossover(4380, 'SINGLE'); // NSP
        drawCrossover(5350, 'DOUBLE'); // Shakurpur
        drawCrossover(16620, 'SINGLE'); // South Campus
        drawCrossover(23740, 'SINGLE'); // Lajpat Nagar
        drawCrossover(31520, 'DOUBLE'); // Shree Ram Mandir
        drawCrossover(34650, 'DOUBLE'); // IP Ext
        drawCrossover(42280, 'SCISSORS'); // Maujpur junction
        drawCrossover(47160, 'SINGLE'); // Sonia Vihar
        drawCrossover(50340, 'SINGLE'); // Jagatpur
        drawCrossover(45460, 'SCISSORS'); // Shiv Vihar End

        // 5.5 Procedural EbiScreen Layout (Blocks & Signals)
        const BLOCK_SIZE = 800; // Generate simulated blocks every 800m
        for (let ch = 0; ch < MAX_CHAINAGE; ch += BLOCK_SIZE) {
            const rx = getPhysicalX(ch);
            const rowIndex = Math.min(NUM_ROWS - 1, Math.floor(ch / rowWidth));
            const cy = getCyForRow(rowIndex);

            // Grey Structural Cuts separating the yellow/green thick lines
            ctx.fillStyle = '#999';
            ctx.fillRect(rx - 1, cy - 19, 2, 6); // DN Separator
            ctx.fillRect(rx - 1, cy + 12, 2, 6); // UP Separator

            const trackIdBase = Math.floor(ch/100) + 1000;
            
            // Labels T-xxxx
            ctx.fillStyle = '#444';
            ctx.font = '7px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(`T${trackIdBase}1`, rx + 15, cy - 9); // DN Track
            ctx.fillText(`T${trackIdBase}2`, rx + 15, cy + 8); // UP Track

            // Dynamic Signal Interlocking Aspect Calculation
            let dnAspect = '#00ff00';
            let upAspect = '#00ff00';
            
            for (const t of trains) {
                const dnDiff = (t.position - ch + LOOP_LENGTH) % LOOP_LENGTH;
                if (t.position <= MAX_CHAINAGE && dnDiff > 0 && dnDiff < BLOCK_SIZE) {
                    dnAspect = '#ff0000';
                }
                
                const upSEQ = 71560 + (71560 - ch);
                const upDiff = (t.position - upSEQ + LOOP_LENGTH) % LOOP_LENGTH;
                if (t.position > MAX_CHAINAGE && upDiff > 0 && upDiff < BLOCK_SIZE) {
                    upAspect = '#ff0000';
                }
            }

            // DN Signal (above track)
            ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(rx, cy - 19); ctx.lineTo(rx, cy - 25); ctx.stroke();
            ctx.fillStyle = dnAspect; ctx.beginPath(); ctx.arc(rx, cy - 25, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillText(`S${trackIdBase}3`, rx, cy - 29);

            // UP Signal (below track)
            ctx.beginPath(); ctx.moveTo(rx, cy + 18); ctx.lineTo(rx, cy + 24); ctx.stroke();
            ctx.fillStyle = upAspect; ctx.beginPath(); ctx.arc(rx, cy + 24, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillText(`S${trackIdBase}4`, rx, cy + 32);
        }

        // 6. Draw MAs and Trains
        trains.forEach((train) => {
            const { x, y, isTop } = getXY(train.position);

            const maDist = mas[train.id];
            if (maDist !== undefined && maDist > 0) {
                ctx.strokeStyle = '#00aaff'; // Light blue MA line
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 6;
                ctx.beginPath();
                
                const numMaSegments = Math.ceil(maDist / 50);
                for (let i = 0; i <= numMaSegments; i++) {
                    const p = (train.position + Math.min(i * 50, maDist)) % LOOP_LENGTH;
                    const { x: px, y: py, isTop: pIsTop } = getXY(p);
                    const yOffset = pIsTop ? -20 : 20;
                    if (i === 0) ctx.moveTo(px, py + yOffset);
                    else ctx.lineTo(px, py + yOffset);
                }
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // Train Body (Red thick block)
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 6;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            
            const trainLengthPx = (train.length / MAX_CHAINAGE) * trackWidthPx * NUM_ROWS;
            let currentLogicalPos = train.position;
            let { x: currentX, y: currentY } = getXY(currentLogicalPos);
            ctx.moveTo(currentX, currentY);

            let accumulatedPx = 0;
            const stepLogical = 5;
            let steps = 0;
            
            while (accumulatedPx < trainLengthPx && steps < 50) {
                const nextLogicalPos = (currentLogicalPos - stepLogical + LOOP_LENGTH) % LOOP_LENGTH;
                const { x: nextX, y: nextY } = getXY(nextLogicalPos);
                const dist = Math.hypot(nextX - currentX, nextY - currentY);
                
                if (dist > 0) {
                    if (accumulatedPx + dist > trainLengthPx) {
                        const ratio = (trainLengthPx - accumulatedPx) / dist;
                        ctx.lineTo(currentX + (nextX - currentX) * ratio, currentY + (nextY - currentY) * ratio);
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
            
            // Train ID - Ebiscreen style Black Box with Green Text
            const tagX = x + (isTop ? -10 : 10);
            const tagY = y + (isTop ? -15 : 15);
            ctx.fillStyle = '#000';
            ctx.fillRect(tagX - 12, tagY - 6, 24, 12);
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 1;
            ctx.strokeRect(tagX - 12, tagY - 6, 24, 12);
            
            ctx.fillStyle = '#0f0';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(train.id.replace('T',''), tagX, tagY + 3);

            if (train.emergencyBrake) {
                ctx.fillStyle = '#E74C3C';
                ctx.beginPath();
                ctx.arc(x, y - 8, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // 7. Draw Failures
        failures.forEach(f => {
            const { x, y } = getXY(f.s);
            ctx.fillStyle = '#E74C3C';
            ctx.beginPath();
            ctx.moveTo(x - 5, y - 5);
            ctx.lineTo(x + 5, y + 5);
            ctx.moveTo(x + 5, y - 5);
            ctx.lineTo(x - 5, y + 5);
            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.fillStyle = '#E74C3C';
            ctx.font = 'bold 8px var(--f-sans)';
            ctx.textAlign = 'center';
            ctx.fillText(`FAIL ${Math.ceil(f.timer / 60)}m`, x, y - 8);
        });

    }, [trains, mas, failures]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSimulatingFailure) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { startX, widthPx } = trackInfoRef.current;
        const MAX_CHAINAGE = 71560;
        const NUM_ROWS = 3;
        const rowHeight = rect.height / NUM_ROWS;
        const rowWidth = MAX_CHAINAGE / NUM_ROWS;
        
        let rowIndex = Math.floor(y / rowHeight);
        rowIndex = Math.max(0, Math.min(NUM_ROWS - 1, rowIndex));
        
        const cy = rowHeight * rowIndex + rowHeight / 2;
        const normalizedX = Math.max(0, Math.min(x - startX, widthPx));
        
        const isLeftToRight = rowIndex % 2 === 0;
        const xProgress = isLeftToRight ? (normalizedX / widthPx) : (1 - (normalizedX / widthPx));
        
        let chainageEstimate = rowIndex * rowWidth + xProgress * rowWidth;
        
        let line = 'DN';
        let direction: 1 | -1 = 1;
        if (y < cy) {
            line = 'DN';
            direction = 1;
        } else {
            line = 'UP';
            direction = -1;
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
        <div className="relative w-full h-full bg-[#c4c6c6] rounded-lg overflow-hidden border shadow-inner">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[#888] text-xl font-bold uppercase tracking-widest pointer-events-none opacity-50">
                EbiScreen Client - L7 Overview
            </div>

            <button 
                onClick={() => setIsSimulatingFailure(!isSimulatingFailure)}
                className={`absolute top-4 right-4 z-10 px-4 py-2 rounded font-bold text-xs uppercase tracking-wider transition-colors ${isSimulatingFailure ? 'bg-red-600 text-white shadow-inner flex items-center gap-2' : 'bg-[#e5e5e5] text-[#333] border border-gray-400 hover:bg-gray-200 shadow'}`}
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
                    className="absolute bg-[#e8e8e8] border border-gray-500 text-black text-xs font-mono px-2 py-1 rounded pointer-events-none shadow-lg z-20 whitespace-nowrap transform -translate-x-1/2 -translate-y-full"
                    style={{ left: hoverData.x, top: hoverData.y - 15 }}
                >
                    {hoverData.line} - CH {hoverData.chainage.toFixed(0)}
                </div>
            )}

            {failureModal.show && (
                <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-[#e8e8e8] border border-gray-400 rounded-sm shadow-2xl p-4 w-[300px]">
                        <h3 className="text-sm font-bold text-black mb-2 mt-0 uppercase border-b border-gray-300 pb-1">Insert Point Failure</h3>
                        <p className="text-xs text-black mb-4 whitespace-nowrap font-mono">
                            Line: <strong>{failureModal.line}</strong> &nbsp; CH: <strong>{failureModal.chainage.toFixed(0)}</strong>
                        </p>
                        
                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">Duration (Min)</label>
                            <input 
                                type="number" 
                                min="1" max="60" 
                                value={failureDuration} 
                                onChange={e => setFailureDuration(Number(e.target.value))}
                                className="w-full px-2 py-1 border border-gray-400 bg-white font-mono text-sm focus:outline-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2 font-medium">
                            <button 
                                onClick={() => setFailureModal({ show: false, s: 0, chainage: 0, line: '' })}
                                className="px-3 py-1 bg-[#ccc] border border-gray-400 text-black hover:bg-gray-300 text-[10px] font-bold uppercase transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    addFailure(failureModal.s, failureDuration);
                                    setFailureModal({ show: false, s: 0, chainage: 0, line: '' });
                                }}
                                className="px-3 py-1 bg-gradient-to-b from-red-500 to-red-600 border border-red-800 text-white text-[10px] font-bold uppercase transition-colors shadow-sm"
                            >
                                Trigger
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
