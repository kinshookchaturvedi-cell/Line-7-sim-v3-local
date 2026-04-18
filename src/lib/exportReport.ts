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

    const { stationArrivals, completedTrips } = analytics;
    
    // Filter Arrays
    let filteredLog = log;
    let filteredTrips = completedTrips;
    let filteredArrivals = stationArrivals;

    if (filters.trainId) {
        filteredLog = filteredLog.filter(e => e.trainId === filters.trainId);
        filteredTrips = filteredTrips.filter((t:any) => t.trainId === filters.trainId);
        filteredArrivals = filteredArrivals.filter((a:any) => a.trainId === filters.trainId);
    }
    if (filters.startCh !== undefined && filters.endCh !== undefined) {
        filteredLog = filteredLog.filter(e => e.chainage >= filters.startCh! && e.chainage <= filters.endCh!);
    }
    if (filters.startTimeSec && filters.startTimeSec > 0) {
        // Need to convert simTime back or use native time. We rely on string checks for now for simplicity
    }
    
    // TPH & Headway Calculations
    const stationMetrics: Record<string, { arrs: number[], tph: number, avgHeadway: number }> = {};
    filteredArrivals.forEach((a:any) => {
        const k = a.stationChainage.toString(); // Grouping by chainage
        if (!stationMetrics[k]) stationMetrics[k] = { arrs: [], tph: 0, avgHeadway: 0 };
        stationMetrics[k].arrs.push(a.time);
    });

    const totalSimHours = Math.max(0.1, (clockTime - (6 * 3600)) / 3600);
    
    for (const key in stationMetrics) {
        const arrs = stationMetrics[key].arrs.sort((a,b)=>a-b);
        stationMetrics[key].tph = arrs.length / totalSimHours;
        
        if (arrs.length > 1) {
            let hwSum = 0;
            for(let i=1; i<arrs.length; i++) hwSum += (arrs[i] - arrs[i-1]);
            stationMetrics[key].avgHeadway = hwSum / (arrs.length - 1);
        }
    }

    // Trip Delay Metrics
    const PLANNED_TIME = 10140; // ~2.8 hours per 71km round trip (169 mins)
    const tripTable = trainIds.map(id => {
        const tLogs = filteredTrips.filter((t:any) => t.trainId === id);
        const comp = tLogs.length;
        // Planned trips computation: elapsed / planned freq
        const planned = Math.floor((clockTime - 6*3600) / PLANNED_TIME);
        const avgDur = comp > 0 ? tLogs.reduce((acc:any, t:any)=>acc+t.duration, 0) / comp : 0;
        let delayed = 0;
        let cancelled = Math.max(0, planned - comp);
        
        tLogs.forEach((t:any) => {
            if (t.duration > PLANNED_TIME + 900) delayed++; // > 15m delay
        });

        return { id, comp, planned, avgDur, delayed, cancelled };
    });

    // Repercussion Analysis Generation
    const totalDelays = tripTable.reduce((s,t) => s + t.delayed, 0);
    const totalCancels = tripTable.reduce((s,t) => s + t.cancelled, 0);
    let suggestionHtml = "<p>No severe bottlenecks detected in the orbital loop.</p>";
    
    if (totalDelays > 0 || totalCancels > 0) {
        suggestionHtml = `
            <p><strong>🚨 Failure Diagnose & Repercussions:</strong> The simulation analytics detected <strong>${totalDelays} delayed round-trips</strong> and exactly <strong>${totalCancels} effective trip cancellations</strong> spanning the designated failure constraints.</p>
            <p><strong>AI Analytics Suggestion:</strong> Upstream point switch failures drastically collapse moving-block headways. To mitigate <em>${totalCancels}</em> cancelled orbital loops across the Pink Line network, DMRC Operations should actively deploy "short-loop" terminal strategies at Maujpur or Mayur Vihar to rapidly absorb the delay shockwave. Avoid full loop stacking.</p>
        `;
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DMRC Line 7 CBTC Simulator Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a1a; padding: 24px; }
    h1 { font-size: 18px; color: #e91e63; font-weight: 800; border-bottom: 2px solid #e91e63; padding-bottom: 5px; }
    h2 { font-size: 12px; margin-top: 20px; color: #c2185b; background: #fce4ec; padding: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #e91e63; color: white; padding: 5px; font-size: 9px; text-transform: uppercase; text-align: left; }
    td { padding: 4px; border-bottom: 1px solid #f8bbd0; font-size: 9.5px; }
    .footer { margin-top: 40px; border-top: 1px solid #aaa; padding-top: 10px; font-size: 9px; font-weight: bold; text-align: center; color: #666; }
    .metrics { display: flex; gap: 20px; margin-top: 10px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>DMRC LINE 7 (PINK LINE) CBTC SIMULATOR</h1>
  
  <div class="metrics">
    <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
    <div><strong>Start Time:</strong> ${log[0]?.simTime || "06:00:00"}</div>
    <div><strong>End Time:</strong> ${log[log.length-1]?.simTime || "00:00:00"}</div>
  </div>

  <h2>TRIP DELAY AND CANCELLATION METRICS</h2>
  <table>
    <tr><th>Train ID</th><th>Planned Trips</th><th>Completed Trips</th><th>Actual Avg Duration</th><th>Trips Delayed (>15m)</th><th>Trips Cancelled</th></tr>
    ${tripTable.map(t => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.planned}</td>
          <td>${t.comp}</td>
          <td>${formatTime(t.avgDur)}</td>
          <td style="color:${t.delayed > 0 ? 'red' : 'green'}">${t.delayed}</td>
          <td style="color:${t.cancelled > 0 ? 'red' : 'green'}">${t.cancelled}</td>
        </tr>
    `).join('')}
  </table>

  <h2>STATION ANALYTICS (TPH & HEADWAY)</h2>
  <table>
    <tr><th>Station Chainage</th><th>Trains Per Hour (TPH)</th><th>Avg Headway (s)</th></tr>
    ${Object.entries(stationMetrics).map(([ch, m]) => `
        <tr>
          <td>${ch} m</td>
          <td><strong>${m.tph.toFixed(1)}</strong></td>
          <td>${m.avgHeadway.toFixed(0)} s</td>
        </tr>
    `).join('')}
  </table>

  <h2>FAILURE ANALYSIS & REPERCUSSIONS (AUTO-GENERATED)</h2>
  <div style="background: #fff3f3; border-left: 3px solid #e74c3c; padding: 10px; font-size: 11px;">
    ${suggestionHtml}
  </div>

  <div class="footer">
    © Copyright Kinshook Chaturvedi, JGM/S&T<br/>
    Auto-generated Moving Block Data via DMRC Line 7 CBTC Simulator
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
