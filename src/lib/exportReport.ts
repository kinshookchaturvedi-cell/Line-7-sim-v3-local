import * as xlsx from 'xlsx';

export interface LogEntry {
    simTime: string;
    trainId: string;
    line: string;
    chainage: number;
    positionM: number;
    speedKmh: number;
    accelMs2: number;
    targetSpeedKmh: number;
    advisorySpeedKmh: number;
    mode: string;
    emergencyBrake: string;
    maDistM: number;
    dwellTimer: number;
}

export interface ReportFilters {
    trainId?: string;
    station?: string;
    startCh?: number;
    endCh?: number;
    startTimeSec?: number;
    endTimeSec?: number;
}

const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export const exportCSV = (log: LogEntry[]) => {
    if (log.length === 0) {
        alert('No simulation data to export.'); return;
    }
    const headers = [ 'Sim Time', 'Train ID', 'Line', 'Chainage (m)', 'Position (m)', 'Speed (km/h)', 'Accel (m/s²)', 'Target Speed (km/h)', 'Advisory (km/h)', 'Mode', 'Emergency Brake', 'MA Dist (m)', 'Dwell (s)' ];
    const rows = log.map(e => [ e.simTime, e.trainId, e.line, e.chainage.toFixed(0), e.positionM.toFixed(0), e.speedKmh.toFixed(1), e.accelMs2.toFixed(2), e.targetSpeedKmh.toFixed(1), e.advisorySpeedKmh.toFixed(1), e.mode, e.emergencyBrake, e.maDistM.toFixed(0), e.dwellTimer.toFixed(0) ]);
    const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Simulation Log');
    
    // Format Filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const sTime = log[0]?.simTime.replace(/:/g, '') || "060000";
    const eTime = log[log.length-1]?.simTime.replace(/:/g, '') || "000000";
    xlsx.writeFile(wb, `DMRC_Line7_Simulation_Report_${dateStr}_${sTime}_to_${eTime}.xlsx`);
};

export const exportPDF = (log: LogEntry[], clockTime: number, trainIds: string[], analytics: any, filters: ReportFilters) => {
    if (log.length === 0) {
        alert('No simulation data. Run simulation first.'); return;
    }

    const { stationArrivals, completedTrips, atrSecondsSaved, failureHistory } = analytics;
    
    // Filter Arrays
    let filteredLog = log;
    let filteredTrips = completedTrips;
    let filteredArrivals = stationArrivals;

    if (filters.trainId) {
        filteredLog = filteredLog.filter(e => e.trainId === filters.trainId);
        filteredTrips = filteredTrips.filter((t:any) => t.trainId === filters.trainId);
        filteredArrivals = filteredArrivals.filter((a:any) => a.trainId === filters.trainId);
    }
    
    // Analytics Calculations
    const PLANNED_TIME = 10140; // ~169 mins
    const scheduledTrips = Math.floor((clockTime - 6*3600) / PLANNED_TIME);
    const totalTripsPerformed = completedTrips.length;
    const reliability = scheduledTrips > 0 ? Math.min(100, (totalTripsPerformed / (scheduledTrips * trainIds.length)) * 100) : 100;
    
    const stationMetrics: Record<string, { arrs: number[], tph: number, avgHeadway: number }> = {};
    filteredArrivals.forEach((a:any) => {
        const k = a.stationChainage.toString();
        if (!stationMetrics[k]) stationMetrics[k] = { arrs: [], tph: 0, avgHeadway: 0 };
        stationMetrics[k].arrs.push(a.time);
    });

    const totalSimHours = Math.max(0.1, (clockTime - (6 * 3600)) / 3600);
    const tphData: { ch: string, tph: number }[] = [];

    for (const key in stationMetrics) {
        const arrs = stationMetrics[key].arrs.sort((a,b)=>a-b);
        stationMetrics[key].tph = arrs.length / totalSimHours;
        tphData.push({ ch: key, tph: stationMetrics[key].tph });
        if (arrs.length > 1) {
            let hwSum = 0;
            for(let i=1; i<arrs.length; i++) hwSum += (arrs[i] - arrs[i-1]);
            stationMetrics[key].avgHeadway = hwSum / (arrs.length - 1);
        }
    }

    // Chart Generation (SVG)
    const maxTph = Math.max(5, ...tphData.map(d => d.tph));
    const tphChart = `
        <svg width="100%" height="120" viewBox="0 0 500 120" style="background:#f9f9f9; border-radius:4px;">
            ${tphData.slice(0, 20).map((d, i) => {
                const h = (d.tph / maxTph) * 80;
                return `<rect x="${i * 24 + 10}" y="${100 - h}" width="18" height="${h}" fill="#e91e63" />
                        <text x="${i * 24 + 19}" y="115" font-size="6" text-anchor="middle" fill="#666">${d.ch.slice(0, 3)}</text>`;
            }).join('')}
            <line x1="0" y1="100" x2="500" y2="100" stroke="#ccc" />
        </svg>
    `;

    const tripTableData = trainIds.map(id => {
        const tLogs = filteredTrips.filter((t:any) => t.trainId === id);
        const comp = tLogs.length;
        const planned = scheduledTrips;
        const avgDur = comp > 0 ? tLogs.reduce((acc:any, t:any)=>acc+t.duration, 0) / comp : 0;
        let delayed = 0;
        tLogs.forEach((t:any) => { if (t.duration > PLANNED_TIME + 900) delayed++; });
        return { id, comp, planned, avgDur, delayed, cancelled: Math.max(0, planned - comp) };
    });

    const totalDelays = tripTableData.reduce((s,t) => s + t.delayed, 0);
    const totalCancels = tripTableData.reduce((s,t) => s + t.cancelled, 0);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DMRC Line 7 Technical Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; padding: 30px; line-height: 1.4; }
    .header-box { display: flex; justify-content: space-between; border-bottom: 3px solid #e91e63; padding-bottom: 10px; margin-bottom: 20px; }
    h1 { color: #e91e63; margin: 0; font-size: 20px; font-weight: 900; }
    .kpi-container { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
    .kpi-card { background: #fdf2f5; border: 1px solid #f8bbd0; padding: 10px; border-radius: 6px; text-align: center; }
    .kpi-val { font-size: 16px; font-weight: bold; color: #e91e63; display: block; }
    .kpi-label { font-size: 8px; text-transform: uppercase; color: #777; font-weight: bold; }
    h2 { font-size: 12px; border-left: 4px solid #e91e63; padding-left: 8px; margin-top: 25px; background: #f9f9f9; padding-top: 4px; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #444; color: white; padding: 6px; font-size: 8px; text-transform: uppercase; text-align: left; }
    td { padding: 5px; border-bottom: 1px solid #eee; font-size: 9px; }
    .chart-container { margin-top: 15px; }
    .failure-box { background: #fff3f3; border: 1px solid #ffcdd2; padding: 10px; border-radius: 4px; border-left: 4px solid #f44336; }
    .footer { margin-top: 50px; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; font-size: 8px; color: #888; }
    .sig-box { margin-top: 40px; display: flex; justify-content: flex-end; gap: 60px; }
    .sig-line { border-top: 1px solid #333; width: 150px; text-align: center; padding-top: 5px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
        <h1>DMRC LINE 7 (PINK LINE)</h1>
        <div style="font-weight: bold; color: #666;">CBTC OPERATIONAL SIMULATION REPORT</div>
    </div>
    <div style="text-align: right; font-size: 9px;">
        <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
        <strong>Ref:</strong> DMRC/L7/SIM/${Math.floor(Math.random()*10000)}
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card">
        <span class="kpi-val">${reliability.toFixed(1)}%</span>
        <span class="kpi-label">Trip Reliability</span>
    </div>
    <div class="kpi-card">
        <span class="kpi-val">${(atrSecondsSaved / 60).toFixed(1)}m</span>
        <span class="kpi-label">ATR Recovery Gain</span>
    </div>
    <div class="kpi-card">
        <span class="kpi-val">${totalDelays}</span>
        <span class="kpi-label">Network Delays</span>
    </div>
    <div class="kpi-card">
        <span class="kpi-val">${totalCancels}</span>
        <span class="kpi-label">Trips Cancelled</span>
    </div>
  </div>

  <h2>I. VISUAL PERFORMANCE ANALYTICS (TPH)</h2>
  <div class="chart-container">
    ${tphChart}
    <p style="font-size: 7px; color: #999; margin-top: 5px;">* Bar chart represents Trains Per Hour (TPH) throughput across primary station chainages.</p>
  </div>

  <h2>II. TRIP RELIABILITY & DELAY ANALYSIS</h2>
  <table>
    <thead>
        <tr><th>Train ID</th><th>Planned</th><th>Actual</th><th>Avg. Duration</th><th>Delayed (>15m)</th><th>Cancelled</th></tr>
    </thead>
    <tbody>
        ${tripTableData.map(t => `
            <tr>
                <td><strong>${t.id}</strong></td>
                <td>${t.planned}</td>
                <td>${t.comp}</td>
                <td>${formatTime(t.avgDur)}</td>
                <td style="color:${t.delayed > 0 ? '#f44336' : '#4caf50'}">${t.delayed}</td>
                <td style="color:${t.cancelled > 0 ? '#f44336' : '#4caf50'}">${t.cancelled}</td>
            </tr>
        `).join('')}
    </tbody>
  </table>

  <h2>III. CHRONOLOGICAL FAILURE LOG</h2>
  <table>
    <thead>
        <tr><th>Failure ID</th><th>Location (CH)</th><th>Start Time</th><th>Duration</th></tr>
    </thead>
    <tbody>
        ${failureHistory.length > 0 ? failureHistory.map((f:any) => `
            <tr>
                <td><strong>${f.id}</strong></td>
                <td>${f.s.toFixed(0)} m</td>
                <td>${formatTime(f.startTime)}</td>
                <td>${(f.duration/60).toFixed(1)} min</td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center;">No failure events recorded during simulation period.</td></tr>'}
    </tbody>
  </table>

  <h2>IV. REPERCUSSION DIAGNOSIS & ATR MITIGATION</h2>
  <div class="failure-box">
    <p><strong>Diagnosis:</strong> ${totalDelays > 0 ? `The network experienced topological congestion. ATR actively intervened to recover <strong>${(atrSecondsSaved/60).toFixed(1)} minutes</strong> of dwell time across the fleet.` : 'Optimal orbital state maintained. ATR idle.'}</p>
    <p><strong>Recommendation:</strong> In cases of point failures at high-density zones, consider short-looping at Maujpur ISBT to prevent headway collapse.</p>
  </div>

  <div class="sig-box">
    <div class="sig-line">Prepared By<br/><span style="font-size:7px; font-weight:normal;">Simulation Systems Dept</span></div>
    <div class="sig-line">Kinshook Chaturvedi<br/><span style="font-size:7px; font-weight:normal;">JGM/S&T, DMRC</span></div>
  </div>

  <div class="footer">
    <div>CONFIDENTIAL - FOR INTERNAL DMRC USE ONLY</div>
    <div>Page 1 of 1</div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 800);
    }
};
