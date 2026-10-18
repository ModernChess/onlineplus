// renderer-helpers.js - Helper module for smoke trails, combat animations, and audio triggers
import { triggerFrontalAttackSound, triggerRangedAttackSound } from './sound.js';

let smokeParticles = [];
let activeExplosions = [];
let activeProjectiles = [];

export function spawnSmokeTrail(unit, prevX, prevY, cellSize) {
    let dx = unit.animX - prevX;
    let dy = unit.animY - prevY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        smokeParticles.push({
            x: unit.animX + cellSize / 2 + (Math.random() - 0.5) * 10,
            y: unit.animY + cellSize / 2 + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            radius: cellSize * 0.12,
            maxRadius: cellSize * 0.38,
            life: 1.0,
            decay: 0.03 + Math.random() * 0.02
        });
    }
}

export function drawSmokeParticles(ctx) {
    ctx.save();
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.radius += (p.maxRadius - p.radius) * 0.05;
        p.life -= p.decay;
        p.alpha = Math.max(0, p.life * 0.3);

        if (p.life <= 0) {
            smokeParticles.splice(i, 1);
        } else {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

export function triggerFrontalExplosion(gridX, gridY, getRenderCoordinatesFunc, canvas, localTeam) {
    triggerFrontalAttackSound(); 
    let pos = getRenderCoordinatesFunc(gridX, gridY, canvas.width, localTeam);
    let centerX = pos.x + pos.cellSize / 2;
    let centerY = pos.y + pos.cellSize / 2;

    activeExplosions.push({
        x: centerX,
        y: centerY,
        cellSize: pos.cellSize,
        startTime: performance.now(),
        duration: 600,
        type: 'frontal',
        particles: createExplosionParticles(centerX, centerY, pos.cellSize)
    });
}

export function triggerFarDestructionTrails(attackerX, attackerY, targetX, targetY, getRenderCoordinatesFunc, canvas, localTeam) {
    triggerRangedAttackSound(); 
    let startPos = getRenderCoordinatesFunc(attackerX, attackerY, canvas.width, localTeam);
    let endPos = getRenderCoordinatesFunc(targetX, targetY, canvas.width, localTeam);

    let startX = startPos.x + startPos.cellSize / 2;
    let startY = startPos.y + startPos.cellSize / 2;
    let targetXCenter = endPos.x + endPos.cellSize / 2;
    let targetYCenter = endPos.y + endPos.cellSize / 2;

    for (let i = 0; i < 3; i++) {
        activeProjectiles.push({
            startX: startX + (Math.random() - 0.5) * 4,
            startY: startY + (Math.random() - 0.5) * 4,
            targetX: targetXCenter + (Math.random() - 0.5) * 10,
            targetY: targetYCenter + (Math.random() - 0.5) * 10,
            startTime: performance.now() + (i * 80),
            duration: 450,
            cellSize: endPos.cellSize,
            gridX: targetX,
            gridY: targetY
        });
    }
}

function createExplosionParticles(x, y, cellSize) {
    let particles = [];
    let count = 24;
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = (Math.random() * 3 + 1) * (cellSize / 30);
        let colors = ['#e74c3c', '#e67e22', '#f1c40f', '#ffffff', '#333333'];
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * (cellSize * 0.15) + 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    return particles;
}

export function drawCombatAnimations(ctx, canvas) {
    let now = performance.now();

    ctx.save();
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        let p = activeProjectiles[i];
        let elapsed = now - p.startTime;

        if (elapsed < 0) continue;

        let progress = elapsed / p.duration;
        if (progress >= 1.0) {
            activeExplosions.push({
                x: p.targetX,
                y: p.targetY,
                cellSize: p.cellSize,
                startTime: now,
                duration: 600,
                type: 'realistic',
                particles: createExplosionParticles(p.targetX, p.targetY, p.cellSize)
            });
            activeProjectiles.splice(i, 1);
            continue;
        }

        let currX = p.startX + (p.targetX - p.startX) * progress;
        let currY = p.startY + (p.targetY - p.startY) * progress;
        let heightArc = Math.sin(progress * Math.PI) * (p.cellSize * 1.5);
        currY -= heightArc;

        let scaleFactor = 0.4 + 2.6 * Math.sin(progress * Math.PI);
        let currentRadius = 1.5 * scaleFactor;

        ctx.strokeStyle = 'rgba(243, 156, 18, 0.7)';
        ctx.lineWidth = Math.max(1, 2.0 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(currX, currY);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 8 * scaleFactor;
        ctx.beginPath();
        ctx.arc(currX, currY, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();

    ctx.save();
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        let ex = activeExplosions[i];
        let elapsed = now - ex.startTime;
        let progress = elapsed / ex.duration;

        if (progress >= 1.0) {
            activeExplosions.splice(i, 1);
            continue;
        }

        let alpha = 1.0 - progress;
        ctx.globalAlpha = alpha;

        let shockwaveRadius = (ex.cellSize * 1.2) * progress;
        ctx.strokeStyle = `rgba(231, 76, 60, ${1 - progress})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, shockwaveRadius, 0, Math.PI * 2);
        ctx.stroke();

        if (ex.particles) {
            ex.particles.forEach(pt => {
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.vx *= 0.92;
                pt.vy *= 0.92;
                
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(0.5, pt.radius * (1 - progress)), 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }
    ctx.restore();
}
