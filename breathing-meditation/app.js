const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cueEl = document.getElementById('cue');
const cycleSecondsInput = document.getElementById('cycleSeconds');
const holdSecondsInput = document.getElementById('holdSeconds');
const sizeInput = document.getElementById('size');
const toggleBtn = document.getElementById('toggleBtn');
const donateAmountInput = document.getElementById('donateAmount');
const donateBtn = document.getElementById('donateBtn');

let running = false;

const DPR = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
	const rect = canvas.getBoundingClientRect();
	canvas.width = Math.floor(rect.width * DPR);
	canvas.height = Math.floor(rect.height * DPR);
	ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const TWO_PI = Math.PI * 2;

const palette = {
	inhale: getCssVar('--accent-inhale', '#6ae3ff'),
	hold: getCssVar('--accent-hold', '#a78bfa'),
	exhale: getCssVar('--accent-exhale', '#ff7c93'),
};

const YOOMONEY_RECEIVER = '4100XXXXXXXXXXXXX';
const YOOMONEY_TARGETS = 'Поддержать медитацию дыхания';
const YOOMONEY_LABEL = 'breathing-meditation';

function getCssVar(name, fallback) {
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function easeInOut(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hsvToRgb(h, s, v) {
	let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
	return [f(5), f(3), f(1)];
}

function rgbaStr(r, g, b, a = 1) {
	return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function mixColors(colorA, colorB, t) {
	const ca = parseColor(colorA);
	const cb = parseColor(colorB);
	return rgbaStr(lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t), lerp(ca.a, cb.a, t));
}

function parseColor(c) {
	if (!c) return { r: 255, g: 255, b: 255, a: 1 };
	c = c.trim();

	// rgb/rgba
	let m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d\.]+))?\)/i);
	if (m) {
		return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
	}

	// hex: #rgb, #rgba, #rrggbb, #rrggbbaa
	let hex = c.replace(/^#/, '');
	if (/^[0-9a-f]{3,8}$/i.test(hex)) {
		if (hex.length === 3) {
			const r = parseInt(hex[0] + hex[0], 16);
			const g = parseInt(hex[1] + hex[1], 16);
			const b = parseInt(hex[2] + hex[2], 16);
			return { r, g, b, a: 1 };
		}
		if (hex.length === 4) {
			const r = parseInt(hex[0] + hex[0], 16);
			const g = parseInt(hex[1] + hex[1], 16);
			const b = parseInt(hex[2] + hex[2], 16);
			const a = parseInt(hex[3] + hex[3], 16) / 255;
			return { r, g, b, a };
		}
		if (hex.length === 6) {
			const r = parseInt(hex.slice(0,2), 16);
			const g = parseInt(hex.slice(2,4), 16);
			const b = parseInt(hex.slice(4,6), 16);
			return { r, g, b, a: 1 };
		}
		if (hex.length === 8) {
			const r = parseInt(hex.slice(0,2), 16);
			const g = parseInt(hex.slice(2,4), 16);
			const b = parseInt(hex.slice(4,6), 16);
			const a = parseInt(hex.slice(6,8), 16) / 255;
			return { r, g, b, a };
		}
	}

	// fallback via DOM computed style (handles named colors etc.)
	const probe = document.createElement('div');
	probe.style.color = c;
	document.body.appendChild(probe);
	const cs = getComputedStyle(probe).color;
	document.body.removeChild(probe);
	const mm = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d\.]+))?\)/i);
	if (mm) {
		return { r: +mm[1], g: +mm[2], b: +mm[3], a: mm[4] ? +mm[4] : 1 };
	}

	return { r: 255, g: 255, b: 255, a: 1 };
}

function buildYooMoneyUrl(sum) {
	const params = new URLSearchParams({
		receiver: YOOMONEY_RECEIVER,
		'quickpay-form': 'donate',
		sum: String(sum),
		targets: YOOMONEY_TARGETS,
		label: YOOMONEY_LABEL,
		successURL: location.origin
	});
	return `https://yoomoney.ru/quickpay/confirm.xml?${params.toString()}`;
}

const state = {
	phase: 'idle', // 'inhale' | 'hold1' | 'exhale' | 'hold2'
	phaseTime: 0,
	phaseDurationsMs: { inhale: 4000, hold: 2000, exhale: 4000, hold2: 2000 },
	cycleStart: performance.now(),
	baseSize: 320,
	radius: 0,
	particles: [],
	colorShift: 0,
};

function updateDurations() {
	const cycleSeconds = clamp(+cycleSecondsInput.value || 8, 4, 60);
	const holdSeconds = clamp(+holdSecondsInput.value || 2, 0, 30);
	const inhale = (cycleSeconds * 0.5) * 1000;
	const exhale = (cycleSeconds * 0.5) * 1000;
	state.phaseDurationsMs = { inhale, hold: holdSeconds * 1000, exhale, hold2: holdSeconds * 1000 };
}

cycleSecondsInput.addEventListener('change', () => { updateDurations(); });
holdSecondsInput.addEventListener('change', () => { updateDurations(); });
sizeInput.addEventListener('input', () => { state.baseSize = +sizeInput.value; });

updateDurations();
state.baseSize = +sizeInput.value;

function nextPhase() {
	if (state.phase === 'idle') {
		state.phase = 'inhale';
		state.phaseTime = 0;
		return;
	}
	if (state.phase === 'inhale') { state.phase = state.phaseDurationsMs.hold > 0 ? 'hold1' : 'exhale'; state.phaseTime = 0; return; }
	if (state.phase === 'hold1') { state.phase = 'exhale'; state.phaseTime = 0; return; }
	if (state.phase === 'exhale') { state.phase = state.phaseDurationsMs.hold2 > 0 ? 'hold2' : 'inhale'; state.phaseTime = 0; return; }
	if (state.phase === 'hold2') { state.phase = 'inhale'; state.phaseTime = 0; return; }
}

function currentCue() {
	switch (state.phase) {
		case 'inhale': return 'Вдох';
		case 'hold1':
		case 'hold2': return 'Задержка';
		case 'exhale': return 'Выдох';
		default: return 'Готовьтесь';
	}
}

function phaseColor() {
	switch (state.phase) {
		case 'inhale': return palette.inhale;
		case 'hold1':
		case 'hold2': return palette.hold;
		case 'exhale': return palette.exhale;
		default: return 'white';
	}
}

function spawnParticles(centerX, centerY, radius, color) {
	const amount = 6 + Math.floor(radius / 60);
	for (let i = 0; i < amount; i++) {
		const a = Math.random() * TWO_PI;
		const dist = radius + (Math.random() * 12 - 6);
		const life = 600 + Math.random() * 800;
		state.particles.push({
			x: centerX + Math.cos(a) * dist,
			y: centerY + Math.sin(a) * dist,
			vx: (Math.random() - 0.5) * 0.6,
			vy: (Math.random() - 0.5) * 0.6,
			r: 2 + Math.random() * 3,
			life,
			age: 0,
			color,
		});
	}
}

function updateParticles(dt) {
	state.particles = state.particles.filter(p => p.age < p.life);
	for (const p of state.particles) {
		p.age += dt;
		p.x += p.vx * dt * 0.06;
		p.y += p.vy * dt * 0.06;
	}
}

function drawParticles() {
	for (const p of state.particles) {
		const alpha = 1 - (p.age / p.life);
		ctx.beginPath();
		ctx.fillStyle = mixColors(p.color, 'rgba(255,255,255,0)', 1 - alpha);
		ctx.arc(p.x, p.y, p.r, 0, TWO_PI);
		ctx.fill();
	}
}

function drawGrid(w, h) {
	ctx.save();
	// radial glow center
	const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
	grad.addColorStop(0, 'rgba(255,255,255,0.03)');
	grad.addColorStop(1, 'rgba(255,255,255,0.0)');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, w, h);

	// subtle concentric rings
	ctx.strokeStyle = 'rgba(255,255,255,0.04)';
	ctx.lineWidth = 1;
	const cx = w / 2; const cy = h / 2;
	for (let r = 36; r < Math.min(w, h) * 0.5; r += 36) {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, TWO_PI);
		ctx.stroke();
	}
	ctx.restore();
}

function draw(timestamp, prevTimestamp) {
	const dt = prevTimestamp === null ? 16 : clamp(timestamp - prevTimestamp, 0, 48);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const rect = canvas.getBoundingClientRect();
	const w = rect.width;
	const h = rect.height;
	const cx = w / 2;
	const cy = h / 2;

	const minR = Math.min(w, h) * 0.18;
	const maxR = Math.max(minR + 10, state.baseSize / 2);

	let factor = 0;
	switch (state.phase) {
		case 'inhale': {
			const t = clamp(state.phaseTime / state.phaseDurationsMs.inhale, 0, 1);
			factor = easeInOut(t);
			break;
		}
		case 'hold1': {
			factor = 1; // freeze at max after inhale
			break;
		}
		case 'exhale': {
			const t = clamp(state.phaseTime / state.phaseDurationsMs.exhale, 0, 1);
			factor = 1 - easeInOut(t);
			break;
		}
		case 'hold2': {
			factor = 0; // freeze at min after exhale
			break;
		}
		default: factor = 0;
	}

	const radius = lerp(minR, maxR, factor);
	state.radius = radius;

	const color = phaseColor();
	const isHolding = state.phase === 'hold1' || state.phase === 'hold2';
	const glow = isHolding ? 0.5 : 0.5 + 0.5 * Math.sin(timestamp * 0.003);
	const ringColor = mixColors(color, '#ffffff', glow * 0.25);

	// background subtle grid
	drawGrid(w, h);

	// draw glow ring
	ctx.save();
	ctx.translate(cx, cy);
	for (let i = 0; i < 6; i++) {
		ctx.beginPath();
		ctx.globalAlpha = 0.08;
		ctx.strokeStyle = ringColor;
		ctx.lineWidth = 18 + i * 6;
		ctx.arc(0, 0, radius, 0, TWO_PI);
		ctx.stroke();
	}
	ctx.restore();

	// main circle
	ctx.beginPath();
	ctx.fillStyle = ringColor;
	ctx.arc(cx, cy, radius * 0.86, 0, TWO_PI);
	ctx.fill();

	if (!isHolding) {
		spawnParticles(cx, cy, radius, ringColor);
	}
	if (!isHolding) {
		updateParticles(dt);
	}
	drawParticles();

	cueEl.textContent = currentCue();

	// Advance time and manage phases
	state.phaseTime += dt;
	const duration = (
		state.phase === 'inhale' ? state.phaseDurationsMs.inhale :
		state.phase === 'hold1' ? state.phaseDurationsMs.hold :
		state.phase === 'exhale' ? state.phaseDurationsMs.exhale :
		state.phase === 'hold2' ? state.phaseDurationsMs.hold2 : 0
	);
	if (running && duration && state.phaseTime >= duration) {
		nextPhase();
	}
}

let last = null;
function loop(ts) {
	draw(ts, last);
	last = ts;
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function start() {
	running = true;
	if (state.phase === 'idle') {
		state.phase = 'inhale';
		state.phaseTime = 0;
	}
	toggleBtn.textContent = 'Пауза';
}

function stop() {
	running = false;
	toggleBtn.textContent = 'Старт';
}

toggleBtn.addEventListener('click', () => {
	running ? stop() : start();
});

// keyboard: space toggles
window.addEventListener('keydown', (e) => {
	if (e.code === 'Space') {
		e.preventDefault();
		running ? stop() : start();
	}
});

if (donateBtn) {
	donateBtn.addEventListener('click', () => {
		const amount = Math.max(10, Math.round(+donateAmountInput.value || 0));
		const url = buildYooMoneyUrl(amount);
		window.open(url, '_blank', 'noopener,noreferrer');
	});
}