// network-monitor.js - Real-time connection quality & low internet modal monitor
import { logToConsole } from './ui-auth.js';

let pingInterval = null;
let isConnectionModalVisible = false;

export function initNetworkMonitor() {
    ensurePingWidgetDom();
    ensureConnectionModalDom();
    startPingMonitoring();
}

function startPingMonitoring() {
    if (pingInterval) clearInterval(pingInterval);
    
    measurePing(evaluatePingQuality);
    pingInterval = setInterval(() => {
        measurePing(evaluatePingQuality);
    }, 5000);

    window.addEventListener('offline', () => {
        showConnectionModal();
    });
}

function ensurePingWidgetDom() {
    if (document.getElementById('floatingPingWidget')) return;

    const widget = document.createElement('div');
    widget.id = 'floatingPingWidget';
    widget.style.cssText = `
        position: fixed; bottom: 12px; right: 12px; z-index: 99998;
        display: flex; align-items: center; gap: 5px; background: rgba(20, 20, 25, 0.9);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);
        font-family: 'Fredoka', sans-serif; font-size: 0.7rem; color: #fff;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5); pointer-events: none;
    `;

    widget.innerHTML = `
        <span id="netIndicatorDot" style="width: 7px; height: 7px; border-radius: 50%; background: #2ecc71; box-shadow: 0 0 6px #2ecc71;"></span>
        <span id="netStatusIcon" style="font-size: 0.7rem;">🟢</span>
        <span><strong id="netPingVal">-- ms</strong></span>
    `;

    document.body.appendChild(widget);
}

function ensureConnectionModalDom() {
    if (document.getElementById('lowConnectionModal')) return;

    const modal = document.createElement('div');
    modal.id = 'lowConnectionModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 10, 15, 0.92); backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px); display: none; flex-direction: column;
        align-items: center; justify-content: center; z-index: 999999; color: #fff;
        font-family: 'Fredoka', sans-serif; text-align: center; padding: 20px;
    `;

    modal.innerHTML = `
        <div style="background: rgba(30, 30, 40, 0.9); border: 1px solid rgba(255,255,255,0.15); padding: 35px 30px; border-radius: 20px; max-width: 380px; width: 90%; box-shadow: 0 25px 60px rgba(0,0,0,0.8);">
            <div id="modalStatusIcon" style="font-size: 3rem; margin-bottom: 12px; filter: drop-shadow(0 0 10px rgba(231,76,60,0.5));">🔴</div>
            <h2 style="margin: 0 0 8px 0; color: #e74c3c; font-size: 1.3rem;">Low Internet Connection</h2>
            <p style="color: #bbb; font-size: 0.85rem; margin-bottom: 20px; line-height: 1.4;">Your network connection is currently unstable or very slow.</p>
            
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(0,0,0,0.4); padding: 10px 16px; border-radius: 12px; margin-bottom: 20px;">
                <span style="font-size: 0.8rem; color: #aaa;">Ping: <strong id="modalPingVal" style="color: #fff;">-- ms</strong></span>
            </div>

            <button id="retryNetBtn" style="background: #3498db; width: 100%; padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer; border: none; color: #fff; font-size: 0.9rem;">Checking Connection...</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('retryNetBtn').onclick = () => {
        const btn = document.getElementById('retryNetBtn');
        btn.innerText = "Rechecking...";
        btn.disabled = true;
        measurePing((ping) => {
            btn.innerText = "Checking Connection...";
            btn.disabled = false;
            if (ping < 400) {
                hideConnectionModal();
            }
        });
    };
}

function measurePing(callback) {
    const startTime = performance.now();
    fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        .then(() => {
            const duration = Math.round(performance.now() - startTime);
            callback(duration);
        })
        .catch(() => {
            callback(999);
        });
}

function evaluatePingQuality(ping) {
    const dot = document.getElementById('netIndicatorDot');
    const icon = document.getElementById('netStatusIcon');
    const pingVal = document.getElementById('netPingVal');
    const modalPingVal = document.getElementById('modalPingVal');
    const modalIcon = document.getElementById('modalStatusIcon');

    const pingText = ping === 999 ? 'Timeout' : `${ping} ms`;
    if (pingVal) pingVal.innerText = pingText;
    if (modalPingVal) modalPingVal.innerText = pingText;

    let color = '#2ecc71'; 
    let emoji = '🟢';
    let isLow = false;

    if (ping > 600 || ping === 999) {
        color = '#e74c3c'; 
        emoji = '🔴';
        isLow = true;
    } else if (ping > 300) {
        color = '#e67e22'; 
        emoji = '🟠';
        isLow = true;
    } else if (ping > 150) {
        color = '#f1c40f'; 
        emoji = '🟡';
    }

    if (dot) {
        dot.style.background = color;
        dot.style.boxShadow = `0 0 6px ${color}`;
    }
    if (icon) icon.innerText = emoji;
    if (modalIcon) modalIcon.innerText = emoji;

    if (isLow) {
        showConnectionModal();
    } else if (isConnectionModalVisible && ping < 250) {
        hideConnectionModal();
    }
}

function showConnectionModal() {
    const modal = document.getElementById('lowConnectionModal');
    if (modal) {
        isConnectionModalVisible = true;
        modal.style.display = 'flex';
    }
}

function hideConnectionModal() {
    const modal = document.getElementById('lowConnectionModal');
    if (modal) {
        isConnectionModalVisible = false;
        modal.style.display = 'none';
    }
}
