import React, { useRef } from 'react';
import * as xlsx from 'xlsx';
import { useSimulation, chainages, shortNames } from './hooks/useSimulation';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Telemetry } from './components/Telemetry';
import { DMI } from './components/DMI';
import { exportCSV, exportPDF } from './lib/exportReport';

export default function App() {
    const [simSpeed, setSimSpeed] = React.useState(1);
    const speedRef = useRef(1);
    
    React.useEffect(() => {
        speedRef.current = simSpeed;
    }, [simSpeed]);

    const { paused, setPaused, initSimulation, loadTimetable, trains, mas, clockTime, failures, addFailure, getLog, clearLog } = useSimulation(speedRef);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target?.result;
            if (data) {
                const workbook = xlsx.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = xlsx.utils.sheet_to_json(worksheet);
                loadTimetable(json);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDownloadSample = () => {
        const ws = xlsx.utils.json_to_sheet([
            { "Train no": "T1", "Start time": "06:00", "End time": "23:15", "Start Station / siding / chainage": "Saket G Block", "End station /siding / chainage": "Lajpat Nagar" },
            { "Train no": "T2", "Start time": "06:10", "End time": "23:15", "Start Station / siding / chainage": "Pushp Vihar", "End station /siding / chainage": "Andrews Ganj" }
        ]);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Timetable");
        xlsx.writeFile(wb, "DMRC_Line11_Timetable.xlsx");
    };

    const formatTime = (timeInSec: number) => {
        const hrs = Math.floor(timeInSec / 3600);
        const mins = Math.floor((timeInSec % 3600) / 60);
        const secs = Math.floor(timeInSec % 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: 'var(--bg)', fontFamily: 'var(--f-sans)', color: 'var(--ink)' }}>
            <aside className="w-[310px] flex-shrink-0 flex flex-col p-5 border-r overflow-y-auto" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--line)' }}>
                <div className="flex justify-between items-center mb-6">
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>DMRC Line 11 CBTC Simulator</h1>
                    <div className="flex gap-2">
                         <button onClick={initSimulation} className="bg-gray-200 hover:bg-gray-300 text-gray-800 p-1.5 px-3 rounded text-[10px] font-bold uppercase transition-colors">
                            Reset
                        </button>
                        <button onClick={() => setPaused(!paused)} className="bg-[#1a1a1a] hover:bg-black text-white p-1.5 px-3 rounded text-[10px] font-bold uppercase transition-colors">
                            {paused ? 'Start' : 'Pause'}
                        </button>
                    </div>
                </div>

                <div className="bg-white text-gray-900 border border-gray-200 p-3 rounded-lg flex flex-col mb-4  shadow-sm">
                    <div className="text-center font-mono text-xl tracking-widest tabular-nums font-bold mb-2">
                        {formatTime(clockTime || 21600)}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                        <span className="text-[10px] font-bold uppercase text-gray-500">Sim Speed</span>
                        <select 
                            value={simSpeed} 
                            onChange={(e) => setSimSpeed(Number(e.target.value))}
                            className="bg-gray-100 border border-gray-300 text-xs px-2 py-1 rounded text-gray-800"
                        >
                            <option value={1}>1x (Normal)</option>
                            <option value={2}>2x</option>
                            <option value={5}>5x</option>
                            <option value={10}>10x</option>
                        </select>
                    </div>
                </div>

                <div className="mb-4 text-center pb-4 flex flex-col gap-2">
                     <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white w-full p-2 rounded text-xs font-bold uppercase transition-colors">
                        Upload Timetable (.xlsx)
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                    <button onClick={handleDownloadSample} className="text-[#3498db] text-[10px] hover:underline uppercase font-bold decoration-[#3498db]">
                        Download Sample Timetable
                    </button>
                </div>

                {/* Export Panel */}
                <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Export Results</h2>
                        <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                            {getLog().length} entries
                        </span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => exportCSV(getLog())}
                            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white w-full p-2 rounded text-[10px] font-bold uppercase transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Export CSV / Excel
                        </button>
                        <button
                            onClick={() => exportPDF(getLog(), clockTime, trains.map(t => t.id))}
                            className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white w-full p-2 rounded text-[10px] font-bold uppercase transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            Export PDF Report
                        </button>
                        <button
                            onClick={clearLog}
                            className="text-gray-400 hover:text-red-500 text-[9px] uppercase font-bold tracking-wider transition-colors"
                        >
                            Clear Log
                        </button>
                    </div>
                </div>

                <div className="mt-2 border border-gray-300 rounded-lg p-3 bg-white shadow-sm">
                    <h2 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-2 border-b pb-1">Station Dictionary</h2>
                    <table className="w-full text-[10px] sm:text-xs text-left">
                        <thead>
                            <tr className="text-gray-500 border-b">
                                <th className="pb-1 font-semibold">Short</th>
                                <th className="pb-1 font-semibold">Long Name</th>
                                <th className="pb-1 text-right font-semibold">Chainage (m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chainages.map((st) => (
                                <tr key={st.name} className="border-b last:border-0 border-gray-100">
                                    <td className="py-1 font-mono text-blue-600 font-bold">{shortNames[st.name] || st.name}</td>
                                    <td className="py-1 text-gray-800">{st.name}</td>
                                    <td className="py-1 text-right font-mono text-gray-600">{st.c.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', marginTop: '32px' }}>System Modules</h2>
                <div className="flex flex-col gap-3">
                    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '10px', background: 'var(--bg)' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>1. Dynamics</h3>
                        <p style={{ fontSize: '0.75rem', color: '#666' }}>Kinematics: v=u+at, s=ut+0.5at²</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '12px', background: 'var(--bg)' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>2. Zone Controller</h3>
                        <p style={{ fontSize: '0.75rem', color: '#666' }}>Moving block, 200m safety buffer</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '12px', background: 'var(--bg)' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>3. ATP</h3>
                        <p style={{ fontSize: '0.75rem', color: '#666' }}>Dynamic braking curve monitoring</p>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
                <div className="flex-1 relative rounded-xl overflow-hidden flex flex-col min-h-[300px]" style={{ background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                    <SimulationCanvas trains={trains} mas={mas} failures={failures} addFailure={addFailure} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                    {trains.map(train => {
                        const allMas = Object.values(mas);
                        const maxMaDist = Math.max(100, Math.ceil(Math.max(0, ...allMas) / 100) * 100);
                        return <DMI key={train.id} train={train} maDist={mas[train.id] || 0} maxMaDist={maxMaDist} />;
                    })}
                </div>

                <div className="flex flex-col gap-6">
                    {trains.map(train => (
                        <Telemetry key={train.id} train={train} maDist={mas[train.id] || 0} />
                    ))}
                </div>
            </main>
        </div>
    );
}
