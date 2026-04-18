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

const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export const exportCSV = (log: LogEntry[]) => {
    if (log.length === 0) {
        alert('No simulation data to export. Run the simulation first, then export.');
        return;
    }

    const headers = [
        'Sim Time', 'Train ID', 'Line', 'Chainage (m)', 'Position (m)',
        'Speed (km/h)', 'Accel (m/s²)', 'Target Speed (km/h)', 'Advisory Speed (km/h)',
        'Mode', 'Emergency Brake', 'MA Distance (m)', 'Dwell Timer (s)'
    ];

    const rows = log.map(e => [
        e.simTime,
        e.trainId,
        e.line,
        e.chainage.toFixed(0),
        e.positionM.toFixed(0),
        e.speedKmh.toFixed(1),
        e.accelMs2.toFixed(2),
        e.targetSpeedKmh.toFixed(1),
        e.advisorySpeedKmh.toFixed(1),
        e.mode,
        e.emergencyBrake,
        e.maDistM.toFixed(0),
        e.dwellTimer.toFixed(0)
    ]);

    const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);

    // Style column widths
    ws['!cols'] = [
        { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 14 }, { wch: 13 },
        { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 19 },
        { wch: 6 }, { wch: 15 }, { wch: 16 }, { wch: 15 }
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Simulation Log');
    xlsx.writeFile(wb, `DMRC_Line11_Simulation_Report.xlsx`);
};

export const exportPDF = (log: LogEntry[], clockTime: number, trainIds: string[]) => {
    if (log.length === 0) {
        alert('No simulation data to export. Run the simulation first, then export.');
        return;
    }

    // Compute per-train summary stats
    const summaries = trainIds.map(id => {
        const entries = log.filter(e => e.trainId === id);
        const avgSpeed = entries.length > 0
            ? entries.reduce((s, e) => s + e.speedKmh, 0) / entries.length
            : 0;
        const maxSpeed = entries.length > 0 ? Math.max(...entries.map(e => e.speedKmh)) : 0;
        const ebEvents = entries.filter(e => e.emergencyBrake === 'YES').length;
        const avgMa = entries.length > 0
            ? entries.reduce((s, e) => s + e.maDistM, 0) / entries.length
            : 0;
        return { id, avgSpeed, maxSpeed, ebEvents, avgMa, samples: entries.length };
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DMRC Line 11 CBTC Simulation Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a1a; padding: 24px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #1a3a6c; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #1a3a6c; font-weight: 800; }
    .header .subtitle { font-size: 10px; color: #666; margin-top: 4px; }
    .badge { background: #1a3a6c; color: white; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.05em; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .meta-card { background: #f0f4fa; border-left: 3px solid #1a3a6c; padding: 8px 12px; border-radius: 0 4px 4px 0; }
    .meta-card .label { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; }
    .meta-card .value { font-size: 14px; font-weight: 700; color: #1a3a6c; margin-top: 2px; }
    h2 { font-size: 12px; font-weight: 700; color: #1a3a6c; border-bottom: 1px solid #c8d8ee; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    section { margin-bottom: 22px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1a3a6c; }
    th { color: white; padding: 5px 8px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    td { padding: 4px 8px; border-bottom: 1px solid #e8edf5; font-size: 9.5px; }
    tr:nth-child(even) td { background: #f7f9fc; }
    .eb-yes { color: #c0392b; font-weight: 700; }
    .eb-no { color: #27ae60; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8.5px; color: #aaa; text-align: center; }
    @media print {
      body { padding: 10px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🚇 DMRC Line 11 CBTC Simulator</h1>
      <div class="subtitle">Simulation Run Report — Computer-Based Train Control (Moving Block)</div>
    </div>
    <div class="badge">CONFIDENTIAL</div>
  </div>

  <div class="meta-grid">
    <div class="meta-card">
      <div class="label">Report Generated</div>
      <div class="value" style="font-size:11px">${new Date().toLocaleString()}</div>
    </div>
    <div class="meta-card">
      <div class="label">Simulation Time</div>
      <div class="value">${formatTime(clockTime)}</div>
    </div>
    <div class="meta-card">
      <div class="label">Total Log Entries</div>
      <div class="value">${log.length}</div>
    </div>
    <div class="meta-card">
      <div class="label">Active Trains</div>
      <div class="value">${trainIds.length}</div>
    </div>
  </div>

  <section>
    <h2>Train Performance Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Train ID</th>
          <th>Avg Speed (km/h)</th>
          <th>Max Speed (km/h)</th>
          <th>Avg MA Dist (m)</th>
          <th>EB Events</th>
          <th>Log Samples</th>
        </tr>
      </thead>
      <tbody>
        ${summaries.map(s => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.avgSpeed.toFixed(1)}</td>
          <td>${s.maxSpeed.toFixed(1)}</td>
          <td>${s.avgMa.toFixed(0)}</td>
          <td class="${s.ebEvents > 0 ? 'eb-yes' : 'eb-no'}">${s.ebEvents > 0 ? `⚠ ${s.ebEvents}` : '✓ 0'}</td>
          <td>${s.samples}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Full Simulation Log</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Train</th>
          <th>Line</th>
          <th>Chainage (m)</th>
          <th>Speed (km/h)</th>
          <th>Accel (m/s²)</th>
          <th>Target (km/h)</th>
          <th>Advisory (km/h)</th>
          <th>Mode</th>
          <th>EB</th>
          <th>MA Dist (m)</th>
          <th>Dwell (s)</th>
        </tr>
      </thead>
      <tbody>
        ${log.map(e => `
        <tr>
          <td>${e.simTime}</td>
          <td><strong>${e.trainId}</strong></td>
          <td>${e.line}</td>
          <td>${e.chainage.toFixed(0)}</td>
          <td>${e.speedKmh.toFixed(1)}</td>
          <td>${e.accelMs2.toFixed(2)}</td>
          <td>${e.targetSpeedKmh.toFixed(1)}</td>
          <td>${e.advisorySpeedKmh.toFixed(1)}</td>
          <td>${e.mode}</td>
          <td class="${e.emergencyBrake === 'YES' ? 'eb-yes' : 'eb-no'}">${e.emergencyBrake === 'YES' ? '⚠ YES' : 'NO'}</td>
          <td>${e.maDistM.toFixed(0)}</td>
          <td>${e.dwellTimer.toFixed(0)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>

  <div class="footer">
    DMRC Line 11 CBTC Simulator — Auto-generated report &nbsp;|&nbsp; Moving Block CBTC System &nbsp;|&nbsp; 8 Stations: SGB → LPN
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
    }
};
