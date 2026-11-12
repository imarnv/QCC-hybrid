/**
 * Layer Lab: one canvas, one live scene per architecture layer.
 * Click a layer card to switch. 3D scenes rotate by drag; everything is plain Canvas 2D.
 */
(() => {
const canvas = document.getElementById('lab-canvas');
if (!canvas) return;
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = {};
const loadColors = () => Object.assign(C, {
    ink: css('--text-primary'), muted: css('--text-muted'), rule: css('--border-subtle'),
    paper: css('--bg-secondary'), manila: css('--manila'),
    seal: css('--accent-quantum'), olive: css('--accent-teal'), brick: css('--accent-rose'), ochre: css('--accent-amber'),
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = 0, H = 0, layer = 1, last = performance.now();
const view = { yaw: 0.6, pitch: -0.35, drag: null, auto: true };

function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── 3D helpers ───────────────────────────────
function rot([x, y, z]) {
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
function proj(p, scale) {
    const [x, y, z] = rot(p), d = 9, f = d / (d + z);
    return { x: W / 2 + x * scale * f, y: H / 2 - y * scale * f, z, f };
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function label(text, x, y, color = C.muted, size = 12, align = 'center', weight = 600) {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px 'Instrument Sans', sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}
function arrow(a, b, color, width = 2.5) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x), s = 9;
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - s * Math.cos(ang - 0.4), b.y - s * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - s * Math.cos(ang + 0.4), b.y - s * Math.sin(ang + 0.4));
    ctx.fill();
}

// ── Side panel ───────────────────────────────
function setPanel(title, desc, controls, hint) {
    $('lab-title').textContent = title;
    $('lab-desc').innerHTML = desc;
    $('lab-controls').innerHTML = controls;
    $('lab-hint').textContent = hint;
    $('lab-readout').innerHTML = '';
}
const readout = rows => { $('lab-readout').innerHTML = rows.map(([k, v, c]) => `<div><span>${k}</span><b style="color:${c || C.ink}">${v}</b></div>`).join(''); };

// ═══════════ Layer 1: BB84 photons ═══════════
const qkd = { photons: [], key: [], spawn: 0, eve: false, sent: 0, discarded: 0, errors: 0, lastBasis: { a: 0, e: 0, b: 0 } };
const angleOf = (basis, bit) => (basis ? 45 : 0) + bit * 90;
const S1 = {
    enter() {
        Object.assign(qkd, { photons: [], key: [], sent: 0, discarded: 0, errors: 0 });
        setPanel('BB84 in motion',
            'Arnav sends single photons, each polarised in a random basis: <b>+</b> (0°/90°) or <b>×</b> (45°/135°). Monesh measures in his own random basis. Only bits where the bases match are kept. Turn Eve on: her measurements disturb the photons, and the error rate (QBER) jumps past 11%.',
            `<button class="btn btn-danger btn-sm" data-act="eve">👁 Eve: off</button><button class="btn btn-ghost btn-sm" data-act="reset">↺ Reset</button>`,
            'Each line through a photon is its polarisation');
    },
    act(a, btn) {
        if (a === 'eve') { qkd.eve = !qkd.eve; btn.textContent = `👁 Eve: ${qkd.eve ? 'on' : 'off'}`; btn.classList.toggle('on', qkd.eve); S1.reset(); }
        if (a === 'reset') S1.reset();
    },
    reset() { Object.assign(qkd, { photons: [], key: [], sent: 0, discarded: 0, errors: 0 }); },
    frame(dt) {
        const ax = Math.max(W * 0.1, 50), bx = W - ax, ex = W / 2, y = H * 0.42;
        qkd.spawn -= dt;
        if (qkd.spawn <= 0) {
            qkd.spawn = 0.3;
            const bit = Math.random() < 0.5 ? 1 : 0, basis = Math.random() < 0.5 ? 1 : 0;
            qkd.photons.push({ x: ax, bit, basis, angle: angleOf(basis, bit), stBasis: basis, eved: false, flash: 0 });
            qkd.lastBasis.a = basis; qkd.sent++;
        }
        // channel
        ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(bx, y); ctx.stroke(); ctx.setLineDash([]);
        const station = (x, name, color, basis) => {
            rr(x - 44, y - 34, 88, 68, 14); ctx.fillStyle = C.paper; ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
            label(name, x, y - 50, color, 13, 'center', 700);
            label(basis ? '×' : '+', x, y + 2, color, 30, 'center', 500);
            label(basis ? 'diagonal' : 'rectilinear', x, y + 48, C.muted, 11);
        };
        station(ax, 'Arnav', C.seal, qkd.lastBasis.a);
        station(bx, 'Monesh', C.olive, qkd.lastBasis.b);
        if (qkd.eve) station(ex, 'Eve', C.brick, qkd.lastBasis.e);

        const speed = W * 0.22;
        qkd.photons = qkd.photons.filter(p => {
            const prev = p.x; p.x += speed * dt; p.flash = Math.max(0, p.flash - dt * 2);
            if (qkd.eve && !p.eved && prev < ex && p.x >= ex) {
                p.eved = true; const eb = Math.random() < 0.5 ? 1 : 0; qkd.lastBasis.e = eb;
                const seen = eb === p.stBasis ? Math.round((p.angle - (p.stBasis ? 45 : 0)) / 90) : (Math.random() < 0.5 ? 1 : 0);
                if (eb !== p.stBasis) p.flash = 1;
                p.stBasis = eb; p.angle = angleOf(eb, seen);
            }
            if (p.x >= bx) {
                const bb = Math.random() < 0.5 ? 1 : 0; qkd.lastBasis.b = bb;
                const got = bb === p.stBasis ? Math.round((p.angle - (p.stBasis ? 45 : 0)) / 90) : (Math.random() < 0.5 ? 1 : 0);
                if (bb === p.basis) { const err = got !== p.bit; qkd.key.push({ bit: got, err }); if (err) qkd.errors++; }
                else qkd.discarded++;
                if (qkd.key.length > 400) qkd.key.shift();
                return false;
            }
            return true;
        });
        for (const p of qkd.photons) {
            if (p.x < ax + 46 || p.x > bx - 46 || (qkd.eve && Math.abs(p.x - ex) < 46)) continue;
            const col = p.flash > 0 ? C.brick : (p.eved ? C.ochre : C.seal);
            ctx.fillStyle = alpha(col, 0.16); ctx.beginPath(); ctx.arc(p.x, y, 15, 0, 7); ctx.fill();
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, y, 5, 0, 7); ctx.fill();
            const r = p.angle * Math.PI / 180;
            ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath();
            ctx.moveTo(p.x - 13 * Math.cos(r), y - 13 * Math.sin(r)); ctx.lineTo(p.x + 13 * Math.cos(r), y + 13 * Math.sin(r)); ctx.stroke();
        }
        // sifted key tape
        const n = Math.min(qkd.key.length, Math.floor((W - 40) / 18)), ky = H * 0.8;
        label('Sifted key (bases matched)', 20, ky - 26, C.muted, 12, 'left');
        qkd.key.slice(-n).forEach((k, i) => {
            rr(20 + i * 18, ky - 10, 15, 22, 4); ctx.fillStyle = alpha(k.err ? C.brick : C.olive, 0.15); ctx.fill();
            label(String(k.bit), 27.5 + i * 18, ky + 1, k.err ? C.brick : C.olive, 12, 'center', 700);
        });
        const qber = qkd.key.length ? qkd.errors / qkd.key.length * 100 : 0;
        readout([['Photons sent', qkd.sent], ['Kept / discarded', `${qkd.key.length} / ${qkd.discarded}`],
            ['QBER', qber.toFixed(1) + '%', qber > 11 ? C.brick : C.olive],
            ['Verdict', qkd.key.length < 12 ? 'gathering…' : qber > 11 ? 'ABORT: eavesdropper' : 'SECURE', qkd.key.length < 12 ? C.muted : qber > 11 ? C.brick : C.olive]]);
    },
};

// ═══════════ Layer 2: Tensor cube twist ═══════════
const Q = 251, N = 4;
const randT = () => Array.from({ length: N }, () => Array.from({ length: N }, () => Array.from({ length: N }, () => Math.floor(Math.random() * Q))));
// ponytail: random matrix mod 251 is invertible with prob ~99.6%; check det if this ever signs real data
const randM = () => Array.from({ length: N }, () => Array.from({ length: N }, () => Math.floor(Math.random() * Q)));
function modeProduct(T, M, axis) {
    const out = randT();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
        const idx = [i, j, k]; let s = 0;
        for (let m = 0; m < N; m++) { const src = [i, j, k]; src[axis] = m; s += M[idx[axis]][m] * T[src[0]][src[1]][src[2]]; }
        out[i][j][k] = s % Q;
    }
    return out;
}
const tens = { T0: randT(), from: null, to: null, axis: -1, t: 0, queue: [], twists: 0 };
tens.cur = tens.T0;
const cellColor = v => `hsl(${18 + 110 * v / Q}, 42%, ${40 + 14 * Math.sin(v)}%)`;
const S2 = {
    enter() {
        setPanel('Twisting the cube',
            'The public key starts as a random 4×4×4 cube of numbers mod 251 (the live tab uses 8×8×8). The secret key is three matrices <b>A, B, C</b>. Each one mixes every slice along one axis: watch the scan plane sweep through. Given only the before and after cubes, recovering A, B, C is the <b>Tensor Isomorphism</b> problem, believed hard even for quantum computers.',
            `<button class="btn btn-sm" data-act="0">Apply A · x</button><button class="btn btn-sm" data-act="1">Apply B · y</button><button class="btn btn-sm" data-act="2">Apply C · z</button><button class="btn btn-primary btn-sm" data-act="all">Full twist</button><button class="btn btn-ghost btn-sm" data-act="reset">↺ New cube</button>`,
            'Drag to rotate the cube');
    },
    act(a) {
        if (a === 'reset') { Object.assign(tens, { T0: randT(), axis: -1, queue: [], twists: 0 }); tens.cur = tens.T0; return; }
        tens.queue.push(...(a === 'all' ? [0, 1, 2] : [+a]));
    },
    frame(dt) {
        if (tens.axis < 0 && tens.queue.length) {
            tens.axis = tens.queue.shift(); tens.t = 0; tens.from = tens.cur; tens.to = modeProduct(tens.cur, randM(), tens.axis);
        }
        if (tens.axis >= 0) {
            tens.t += dt / 1.3;
            if (tens.t >= 1) { tens.cur = tens.to; tens.axis = -1; tens.twists++; }
        }
        const scale = Math.min(W, H) * 0.17, sp = 1.05, half = (N - 1) / 2;
        const sweep = tens.axis >= 0 ? ease(Math.min(tens.t, 1)) * (N + 1) - 1 : null;
        const cells = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
            const idx = [i, j, k];
            let v = tens.cur[i][j][k], pop = 0;
            if (tens.axis >= 0) {
                const passed = sweep - idx[tens.axis];
                v = passed > 0 ? tens.to[i][j][k] : tens.from[i][j][k];
                pop = Math.max(0, 1 - Math.abs(passed) * 1.6);
            }
            const p = proj([(i - half) * sp, (j - half) * sp, (k - half) * sp], scale);
            cells.push({ p, v, pop, idx });
        }
        // scan plane
        if (tens.axis >= 0) {
            const a = tens.axis, o = Math.max(-0.5, Math.min(N - 0.5, sweep)) - half, e = half * sp + 0.7;
            const corners = [[-e, -e], [e, -e], [e, e], [-e, e]].map(([u, w]) => {
                const v3 = [0, 0, 0], others = [0, 1, 2].filter(x => x !== a);
                v3[a] = o * sp; v3[others[0]] = u; v3[others[1]] = w; return proj(v3, scale);
            });
            ctx.beginPath(); corners.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)); ctx.closePath();
            ctx.fillStyle = alpha(C.ochre, 0.12); ctx.fill(); ctx.strokeStyle = alpha(C.ochre, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
        }
        cells.sort((a, b) => b.p.z - a.p.z);
        for (const c of cells) {
            const s = scale * 0.42 * c.p.f * (1 + c.pop * 0.35);
            ctx.globalAlpha = 0.55 + 0.45 * Math.max(0, Math.min(1, (2.5 - c.p.z) / 5));
            rr(c.p.x - s / 2, c.p.y - s / 2, s, s, s * 0.22); ctx.fillStyle = cellColor(c.v); ctx.fill();
            if (c.pop > 0.05) { ctx.strokeStyle = C.ochre; ctx.lineWidth = 2; ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
        // axis gizmo
        const o = { x: 48, y: H - 44 };
        ['x', 'y', 'z'].forEach((n, a) => {
            const v = [0, 0, 0]; v[a] = 1; const r = rot(v);
            const tip = { x: o.x + r[0] * 28, y: o.y - r[1] * 28 };
            arrow(o, tip, a === tens.axis ? C.ochre : C.muted, 2);
            label(n, o.x + r[0] * 38, o.y - r[1] * 38, a === tens.axis ? C.ochre : C.muted, 11, 'center', 700);
        });
        label(tens.twists ? 'T₁ = (A, B, C) · T₀' : 'T₀ (public cube)', W / 2, 24, C.ink, 14, 'center', 700);
        readout([['Twists applied', tens.twists], ['Now mixing', tens.axis >= 0 ? ['A along x', 'B along y', 'C along z'][tens.axis] : '—', C.ochre],
            ['Secret key space', '≈ 251^48'], ['Sample cell T[0][0][0]', tens.cur[0][0][0]]]);
    },
};

// ═══════════ Layer 3: 3D lattice ═══════════
const G = [[1, 0.12, 0], [0.08, 1, 0.1], [0, 0.15, 1]];       // private "good" basis: short, near-orthogonal
const U = [[3, 1, 1], [2, 1, 1], [1, 1, 2]];                    // unimodular (det 1): same lattice; public rounding fails ~60-85% at visible noise
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const BAD = mul(U, G);                                           // public "bad" basis: long, skewed
const vecMat = (v, M) => M[0].map((_, j) => v.reduce((s, x, k) => s + x * M[k][j], 0));
function inv3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
    return [[A, -(b * i - c * h), b * f - c * e], [B, a * i - c * g, -(a * f - c * d)], [Cc, -(a * h - b * g), a * e - b * d]].map(r => r.map(v => v / det));
}
const babai = (t, B) => vecMat(vecMat(t, inv3(B)).map(Math.round), B);
const lat = { pts: [], showBad: 0, target: 0, noise: 0.35, secret: null, err: null, solve: null, solveT: 0 };
for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
    const p = vecMat([a, b, c], G); if (Math.hypot(...p) < 2.7) lat.pts.push({ c: [a, b, c], p });
}
function newSecret() {
    const cs = [[1, -1, 1], [-1, 1, 0], [1, 1, -1], [0, -1, 1], [-1, 0, -1]];
    lat.secret = vecMat(cs[Math.floor(Math.random() * cs.length)], G);
    const d = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], n = Math.hypot(...d);
    lat.err = d.map(x => x / n * lat.noise);
    lat.solve = null;
}
newSecret();
const S3 = {
    enter() {
        lat.target = 0; lat.solve = null;
        setPanel('Hiding a point in a lattice',
            'A lattice is every integer combination of a few basis vectors. Encryption hides a secret lattice point (olive) by adding small random noise: the ciphertext is the red point. The <b>private key</b> is a short, tidy basis: rounding with it snaps straight back to the secret. The <b>public key</b> describes the same lattice with long, skewed vectors, and rounding with those usually lands on the wrong point (press attack a few times, and raise the noise). In 512+ dimensions, nobody knows how to fix that, quantum or not.',
            `<button class="btn btn-sm" data-act="basis">Show public (bad) basis</button><button class="btn btn-teal btn-sm" data-act="good">Decrypt with private basis</button><button class="btn btn-danger btn-sm" data-act="bad">Attack with public basis</button><button class="btn btn-ghost btn-sm" data-act="new">↺ New ciphertext</button>
             <label class="lab-slider">Noise <input type="range" min="0.05" max="0.49" step="0.01" value="${lat.noise}" data-act="noise"><output>${lat.noise}</output></label>`,
            'Drag to rotate the lattice');
    },
    act(a, el) {
        if (a === 'basis') { lat.target = lat.target ? 0 : 1; el.textContent = lat.target ? 'Show private (good) basis' : 'Show public (bad) basis'; }
        if (a === 'new') newSecret();
        if (a === 'noise') { lat.noise = +el.value; el.nextElementSibling.textContent = el.value; const n = Math.hypot(...lat.err); lat.err = lat.err.map(x => x / n * lat.noise); lat.solve = null; }
        if (a === 'good' || a === 'bad') {
            const t = lat.secret.map((v, i) => v + lat.err[i]);
            const got = babai(t, a === 'good' ? G : BAD);
            lat.solve = { got, ok: Math.hypot(...got.map((v, i) => v - lat.secret[i])) < 1e-6, with: a };
            lat.solveT = 0;
            if (a === 'bad' && !lat.target) { lat.target = 1; $('lab-controls').querySelector('[data-act="basis"]').textContent = 'Show private (good) basis'; }
            if (a === 'good' && lat.target) { lat.target = 0; $('lab-controls').querySelector('[data-act="basis"]').textContent = 'Show public (bad) basis'; }
        }
    },
    frame(dt, time) {
        lat.showBad += (lat.target - lat.showBad) * Math.min(1, dt * 4);
        const scale = Math.min(W, H) * 0.2;
        // edges along the good basis
        const key = c => c.join(',');
        const map = new Map(lat.pts.map(p => [key(p.c), p]));
        ctx.lineWidth = 1;
        for (const p of lat.pts) for (let a = 0; a < 3; a++) {
            const c2 = p.c.slice(); c2[a]++; const q = map.get(key(c2)); if (!q) continue;
            const A = proj(p.p, scale), B = proj(q.p, scale);
            ctx.strokeStyle = alpha(C.muted, 0.18 * A.f); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        }
        // points, depth sorted
        const drawn = lat.pts.map(p => ({ ...p, s: proj(p.p, scale) })).sort((a, b) => b.s.z - a.s.z);
        for (const d of drawn) {
            const r = 4.2 * d.s.f, g = ctx.createRadialGradient(d.s.x - r / 3, d.s.y - r / 3, 0, d.s.x, d.s.y, r);
            g.addColorStop(0, C.paper); g.addColorStop(1, C.seal);
            ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, (3 - d.s.z) / 6));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.s.x, d.s.y, r, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // basis vectors morphing good ⇄ bad (same lattice either way)
        const o = proj([0, 0, 0], scale), t = ease(lat.showBad);
        const bcol = t > 0.5 ? C.brick : C.olive;
        [0, 1, 2].forEach(i => {
            const v = mix(G[i], BAD[i], t), tip = proj(v, scale);
            arrow(o, tip, bcol, 3);
            label(`b${'₁₂₃'[i]}`, tip.x + 12, tip.y - 10, bcol, 13, 'center', 700);
        });
        // secret + noise → ciphertext
        const wob = reduced ? 0 : Math.sin(time * 2.2) * 0.04;
        const sec = proj(lat.secret, scale);
        const tgt = proj(lat.secret.map((v, i) => v + lat.err[i] * (1 + wob)), scale);
        ctx.fillStyle = alpha(C.olive, 0.2); ctx.beginPath(); ctx.arc(sec.x, sec.y, 15, 0, 7); ctx.fill();
        ctx.fillStyle = C.olive; ctx.beginPath(); ctx.arc(sec.x, sec.y, 7, 0, 7); ctx.fill();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.brick; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sec.x, sec.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.brick; ctx.beginPath(); ctx.arc(tgt.x, tgt.y, 6, 0, 7); ctx.fill();
        label('secret', sec.x, sec.y + 24, C.olive, 11, 'center', 700);
        label('ciphertext', tgt.x, tgt.y - 18, C.brick, 11, 'center', 700);
        // decryption attempt: animate the rounding jump
        if (lat.solve) {
            lat.solveT = Math.min(1, lat.solveT + dt * 1.2);
            const g = proj(lat.solve.got, scale), k = ease(lat.solveT), col = lat.solve.ok ? C.olive : C.brick;
            arrow(tgt, { x: tgt.x + (g.x - tgt.x) * k, y: tgt.y + (g.y - tgt.y) * k }, col, 2.5);
            if (lat.solveT >= 1) {
                ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, 13, 0, 7); ctx.stroke();
                label(lat.solve.ok ? '✓ recovered' : '✗ wrong point', g.x, g.y + 28, col, 12, 'center', 700);
            }
        }
        const len = M => Math.max(...M.map(v => Math.hypot(...v))).toFixed(2);
        readout([['Basis shown', t > 0.5 ? 'public (bad)' : 'private (good)', bcol], ['Longest vector', t > 0.5 ? len(BAD) : len(G)],
            ['Noise |e|', lat.noise.toFixed(2)],
            ['Last attempt', lat.solve ? `${lat.solve.with === 'good' ? 'private' : 'public'} → ${lat.solve.ok ? 'recovered' : 'failed'}` : '—', lat.solve ? (lat.solve.ok ? C.olive : C.brick) : C.muted]]);
    },
};

// ═══════════ Layer 4: hybrid key fusion ═══════════
const hyb = { qkdDown: false, pqcDown: false, parts: [], spawn: 0, cipher: '', ptr: 0, tick: 0 };
const MSG = 'Hello, Quantum World! ';
const S4 = {
    enter() {
        setPanel('Two keys, one lock',
            'The quantum key (BB84) and the lattice key (Kyber-style KEM) are poured into <b>HKDF</b>, which fuses them into one 256-bit key for <b>AES-256-GCM</b>. Break either input and the output key is still unpredictable: an attacker has to defeat <i>both</i> the physics and the maths. Try knocking each layer out.',
            `<button class="btn btn-sm" data-act="qkd">Break QKD link</button><button class="btn btn-sm" data-act="pqc">Break lattice KEM</button>`,
            'Particles are key material flowing through the pipeline');
    },
    act(a, btn) {
        if (a === 'qkd') { hyb.qkdDown = !hyb.qkdDown; btn.textContent = hyb.qkdDown ? 'Restore QKD link' : 'Break QKD link'; btn.classList.toggle('on', hyb.qkdDown); }
        if (a === 'pqc') { hyb.pqcDown = !hyb.pqcDown; btn.textContent = hyb.pqcDown ? 'Restore lattice KEM' : 'Break lattice KEM'; btn.classList.toggle('on', hyb.pqcDown); }
    },
    frame(dt) {
        const qa = { x: W * 0.12, y: H * 0.26 }, pa = { x: W * 0.12, y: H * 0.74 }, hk = { x: W * 0.46, y: H * 0.5 }, ae = { x: W * 0.72, y: H * 0.5 };
        const secure = !(hyb.qkdDown && hyb.pqcDown);
        const curve = (a, b, t) => { const cx = (a.x + b.x) / 2; const u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y }; };
        const path = (a, b, color, dashed) => {
            ctx.strokeStyle = alpha(color, 0.35); ctx.lineWidth = 3; ctx.setLineDash(dashed ? [6, 8] : []);
            ctx.beginPath(); for (let t = 0; t <= 1.001; t += 0.05) { const p = curve(a, b, t); t ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.setLineDash([]);
        };
        path(qa, hk, hyb.qkdDown ? C.brick : C.seal, hyb.qkdDown);
        path(pa, hk, hyb.pqcDown ? C.brick : C.olive, hyb.pqcDown);
        path(hk, ae, secure ? C.ochre : C.brick, !secure);
        hyb.spawn -= dt;
        if (hyb.spawn <= 0) {
            hyb.spawn = 0.12;
            hyb.parts.push({ seg: 0, t: 0, col: hyb.qkdDown ? C.brick : C.seal }, { seg: 1, t: 0, col: hyb.pqcDown ? C.brick : C.olive });
        }
        hyb.parts = hyb.parts.filter(p => {
            p.t += dt * 0.7;
            if (p.t >= 1) { if (p.seg < 2 && Math.random() < 0.5) { p.seg = 2; p.t = 0; p.col = secure ? C.ochre : C.brick; return true; } return false; }
            const [a, b] = [[qa, hk], [pa, hk], [hk, ae]][p.seg], q = curve(a, b, p.t);
            ctx.fillStyle = p.col; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
            return true;
        });
        const node = (p, w, title, sub, color, down) => {
            rr(p.x - w / 2, p.y - 30, w, 60, 14); ctx.fillStyle = C.paper; ctx.fill();
            ctx.strokeStyle = down ? C.brick : color; ctx.lineWidth = 2; ctx.setLineDash(down ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
            label(title, p.x, p.y - 8, down ? C.brick : color, 13, 'center', 700);
            label(down ? 'compromised' : sub, p.x, p.y + 12, down ? C.brick : C.muted, 11);
        };
        node(qa, Math.min(150, W * 0.2), 'BB84 QKD', 'quantum key', C.seal, hyb.qkdDown);
        node(pa, Math.min(150, W * 0.2), 'Lattice KEM', 'PQC secret', C.olive, hyb.pqcDown);
        node(hk, Math.min(120, W * 0.17), 'HKDF', 'key fusion', C.ochre, false);
        node(ae, Math.min(140, W * 0.19), 'AES-256-GCM', 'encrypt', secure ? C.ink : C.brick, !secure);
        // plaintext → ciphertext ticker
        hyb.tick -= dt;
        if (hyb.tick <= 0) {
            hyb.tick = 0.12; hyb.ptr = (hyb.ptr + 1) % MSG.length;
            hyb.cipher = (hyb.cipher + (secure ? Math.floor(Math.random() * 256).toString(16).padStart(2, '0') : MSG.charCodeAt(hyb.ptr).toString(16))).slice(-16);
        }
        const ox = W * 0.88;
        label('plaintext', ae.x, ae.y - 56, C.muted, 11);
        label(`“${MSG.slice(hyb.ptr, hyb.ptr + 10)}”`, ae.x, ae.y - 42, C.ink, 12, 'center', 500);
        label('ciphertext', ox, ae.y - 20, C.muted, 11);
        ctx.font = "500 12px 'Geist Mono', monospace"; ctx.fillStyle = secure ? C.ochre : C.brick; ctx.textAlign = 'center';
        ctx.fillText(hyb.cipher.slice(0, 8), ox, ae.y); ctx.fillText(hyb.cipher.slice(8), ox, ae.y + 16);
        const sources = 2 - hyb.qkdDown - hyb.pqcDown;
        readout([['Healthy key sources', `${sources} / 2`, sources ? C.olive : C.brick],
            ['Fused key', secure ? 'unpredictable' : 'known to attacker', secure ? C.olive : C.brick],
            ['Message', secure ? 'confidential + authenticated' : 'exposed', secure ? C.olive : C.brick]]);
    },
};

// ── Wiring ───────────────────────────────────
const scenes = { 1: S1, 2: S2, 3: S3, 4: S4 };
function select(n) {
    layer = n;
    document.querySelectorAll('.arch-layer').forEach(el => el.classList.toggle('selected', +el.dataset.layer === n));
    canvas.classList.toggle('grab', n === 2 || n === 3);
    scenes[n].enter();
}
document.querySelectorAll('.arch-layer').forEach(el => {
    el.addEventListener('click', () => select(+el.dataset.layer));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+el.dataset.layer); } });
});
$('lab-controls').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) scenes[layer].act(b.dataset.act, b); });
$('lab-controls').addEventListener('input', e => { if (e.target.dataset.act) scenes[layer].act(e.target.dataset.act, e.target); });

canvas.addEventListener('pointerdown', e => { if (layer === 2 || layer === 3) { view.drag = { x: e.clientX, y: e.clientY }; view.auto = false; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', e => {
    if (!view.drag) return;
    view.yaw += (e.clientX - view.drag.x) * 0.01;
    view.pitch = Math.max(-1.4, Math.min(1.4, view.pitch + (e.clientY - view.drag.y) * 0.01));
    view.drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { if (view.drag) { view.drag = null; setTimeout(() => { if (!view.drag) view.auto = true; }, 2500); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (view.auto && !reduced) view.yaw += dt * 0.25;
    ctx.clearRect(0, 0, W, H);
    scenes[layer].frame(dt, now / 1000);
    requestAnimationFrame(loop);
}
new ResizeObserver(resize).observe(canvas);
loadColors(); resize(); select(1); requestAnimationFrame(loop);
})();
