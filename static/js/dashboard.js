/**
 * Quantum-Resilient Cryptographic Framework — Dashboard JS
 */

const API = '';

// ── Tab Navigation ───────────────────────────
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add('active');
}

// ── Utility ──────────────────────────────────
function showLoading(el) {
    el.innerHTML = '<div class="spinner"></div><p class="loading-text">Processing quantum operations...</p>';
}

function createBitStream(bits, errorPositions = []) {
    return bits.map((b, i) => {
        const isError = errorPositions.includes(i);
        const cls = isError ? 'bit bit-error' : (b === 1 ? 'bit bit-1' : 'bit bit-0');
        return `<div class="${cls}" title="Bit ${i}: ${b}${isError ? ' (ERROR)' : ''}">${b}</div>`;
    }).join('');
}

function createDataGrid(data) {
    return '<div class="data-grid">' +
        Object.entries(data).map(([k, v]) => {
            if (typeof v === 'object') return '';
            return `<div class="data-item"><span class="label">${k.replace(/_/g, ' ')}</span><span class="value">${v}</span></div>`;
        }).join('') + '</div>';
}

function createSteps(steps) {
    return '<div class="steps-container">' +
        steps.map((s, i) => `
            <div class="step" style="animation-delay: ${i * 0.1}s">
                <div class="step-number">${i + 1}</div>
                <div class="step-content">
                    <h4>${s.phase}</h4>
                    <p>${s.description}</p>
                </div>
            </div>
        `).join('') + '</div>';
}

// ── BB84 QKD ─────────────────────────────────
async function runBB84() {
    const resultsEl = document.getElementById('bb84-results');
    showLoading(resultsEl);

    const numQubits = parseInt(document.getElementById('bb84-qubits').value) || 256;
    const eavesdropper = document.getElementById('bb84-eve').checked;

    try {
        const res = await fetch(API + '/api/bb84/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num_qubits: numQubits, eavesdropper })
        });
        const data = await res.json();
        const r = data.result;

        // Update stats
        document.getElementById('stat-qubits').textContent = r.num_qubits_sent;
        document.getElementById('stat-sifted').textContent = r.sifted_key_length;
        document.getElementById('stat-qber').textContent = r.qber_percentage + '%';
        document.getElementById('stat-qber').className = 'stat-value ' + (r.eavesdropper_detected ? 'rose' : 'green');
        document.getElementById('stat-status').textContent = r.security_status;
        document.getElementById('stat-status').className = 'stat-value ' + (r.security_status === 'SECURE' ? 'green' : 'rose');

        // Update QBER meter
        const meterFill = document.getElementById('qber-meter-fill');
        const pct = Math.min(r.qber_percentage / 25 * 100, 100);
        meterFill.style.width = pct + '%';
        meterFill.className = 'security-meter-fill ' + (r.qber_percentage > 11 ? 'meter-danger' : r.qber_percentage > 5 ? 'meter-warning' : 'meter-secure');

        let html = '';

        // Protocol steps
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">📋</span>Protocol Steps</div>';
        html += `<span class="card-badge ${r.security_status === 'SECURE' ? 'badge-secure' : 'badge-danger'}">${r.security_status}</span>`;
        html += '</div>' + createSteps(r.protocol_steps) + '</div>';

        // Bit streams
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔢</span>Bit Streams (First 50)</div></div>';
        html += '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Arnav\'s Bits:</p>';
        html += '<div class="bit-stream">' + createBitStream(r.alice_bits) + '</div>';
        html += '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;margin-top:12px;">Monesh\'s Measurements:</p>';
        html += '<div class="bit-stream">' + createBitStream(r.bob_measurements, r.error_positions) + '</div>';
        html += '</div>';

        // Key
        if (r.final_key) {
            html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔑</span>Generated Key</div>';
            html += '<span class="card-badge badge-quantum">' + r.final_key_length + ' bits</span></div>';
            html += '<div class="key-display">' + r.final_key + '</div></div>';
        }

        // Timing
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">⏱️</span>Performance</div></div>';
        html += createDataGrid(r.timing) + '</div>';

        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-rose)">Error: ${e.message}</p></div>`;
    }
}

// ── Post-Quantum Crypto ──────────────────────
async function runPQC() {
    const resultsEl = document.getElementById('pqc-results');
    showLoading(resultsEl);

    const level = parseInt(document.getElementById('pqc-level').value) || 3;

    try {
        const res = await fetch(API + '/api/pqc/kem-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ security_level: level })
        });
        const data = await res.json();
        const r = data.result;

        let html = '';

        // Algorithm info
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔐</span>Algorithm Information</div>';
        html += '<span class="card-badge badge-quantum">' + r.algorithm_info.nist_equivalent + '</span></div>';
        html += createDataGrid({
            'Algorithm': r.algorithm_info.algorithm,
            'Type': r.algorithm_info.type,
            'Basis': r.algorithm_info.basis,
            'Inspired By': r.algorithm_info.inspired_by,
            'Quantum Safe': r.algorithm_info.quantum_safe ? '✅ Yes' : '❌ No',
            'N': r.algorithm_info.parameters.n,
            'Q': r.algorithm_info.parameters.q,
            'K': r.algorithm_info.parameters.k,
        }) + '</div>';

        // Encapsulation
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">📦</span>Key Encapsulation</div></div>';
        html += createDataGrid({
            'Ciphertext Size': r.encapsulation.ciphertext_size_bytes + ' bytes',
            'Encapsulation Time': r.encapsulation.time_ms + ' ms',
            'Decapsulation Time': r.decapsulation.time_ms + ' ms',
        });
        html += '<div class="key-display"><strong>Shared Secret (Encap):</strong><br>' + r.encapsulation.shared_secret_hex + '</div>';
        html += '<div class="key-display" style="margin-top:8px;"><strong>Recovered Secret (Decap):</strong><br>' + r.decapsulation.recovered_secret_hex + '</div>';
        html += '</div>';

        // Key sizes
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">📏</span>Key Sizes</div></div>';
        html += createDataGrid(r.key_sizes) + '</div>';

        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-rose)">Error: ${e.message}</p></div>`;
    }
}

// ── Tensor Auth ──────────────────────────────
function renderCube(tensor, q) {
    const n = tensor.length;
    let html = '<div class="cube-stage"><div class="cube3d">';
    for (let k = 0; k < n; k++) {
        html += `<div class="cube-slice" style="grid-template:repeat(${n},1fr)/repeat(${n},1fr);transform:translateZ(${(k - (n - 1) / 2) * 18}px)">`;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const v = tensor[i][j][k];
            html += `<div class="cube-cell" style="background:hsla(${18 + 110 * v / q},42%,48%,0.7)" title="T[${i}][${j}][${k}] = ${v}"></div>`;
        }
        html += '</div>';
    }
    return html + '</div></div>';
}

async function runTensor() {
    const resultsEl = document.getElementById('tensor-results');
    showLoading(resultsEl);
    const message = document.getElementById('tensor-message').value;

    try {
        const res = await fetch(API + '/api/tensor/demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const r = (await res.json()).result;
        const v = r.verification;
        const q = 251;

        let html = '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🧊</span>The Secret Twist</div>';
        html += '<span class="card-badge badge-warning">8 × 8 × 8 cube over F₂₅₁</span></div>';
        html += '<div class="cube-row">';
        html += '<div class="cube-col"><h4>Public cube T₀</h4>' + renderCube(r.cube_before, q) + '</div>';
        html += '<div class="cube-arrow">→<span>secret (A, B, C)</span><code>A[0..2] = ' + JSON.stringify(r.secret_A_preview) + '</code></div>';
        html += '<div class="cube-col"><h4>Public cube T₁ = (A,B,C)·T₀</h4>' + renderCube(r.cube_after, q) + '</div>';
        html += '</div></div>';

        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">✍️</span>Signature Verification</div>';
        html += `<span class="card-badge ${v.genuine_signature ? 'badge-secure' : 'badge-danger'}">${v.genuine_signature ? 'VALID' : 'INVALID'}</span></div>`;
        html += createDataGrid({
            'Genuine signature': v.genuine_signature ? '✅ Accepted' : '❌ Rejected',
            'Tampered message': v.tampered_message ? '⚠️ Accepted' : '🛑 Rejected',
            'Attacker public key': v.attacker_public_key ? '⚠️ Accepted' : '🛑 Rejected',
        });
        html += '<div class="key-display" style="margin-top:12px"><strong>Challenge digest (SHA-256):</strong><br>' + r.signature_digest + '</div></div>';

        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">📐</span>Algorithm &amp; Sizes</div></div>';
        html += createDataGrid({ ...r.info, ...r.sizes, ...Object.fromEntries(Object.entries(r.timing_ms).map(([k, t]) => [k + '_ms', t])) }) + '</div>';

        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-rose)">Error: ${e.message}</p></div>`;
    }
}

// ── Hybrid Encryption ────────────────────────
async function runHybrid() {
    const resultsEl = document.getElementById('hybrid-results');
    showLoading(resultsEl);

    const message = document.getElementById('hybrid-message').value || 'Hello, Quantum World!';
    const qubits = parseInt(document.getElementById('hybrid-qubits').value) || 256;
    const eavesdropper = document.getElementById('hybrid-eve').checked;

    // Animate pipeline
    const stages = document.querySelectorAll('#hybrid-pipeline .pipeline-stage');
    for (let i = 0; i < stages.length; i++) {
        setTimeout(() => {
            stages.forEach(s => s.classList.remove('active'));
            stages[i].classList.add('active');
            if (i > 0) stages[i - 1].classList.add('complete');
        }, i * 400);
    }

    try {
        const res = await fetch(API + '/api/hybrid/encrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, num_qubits: qubits, eavesdropper })
        });
        const data = await res.json();
        const r = data.result;

        setTimeout(() => {
            stages.forEach(s => { s.classList.remove('active'); s.classList.add('complete'); });
        }, stages.length * 400);

        let html = '';

        // QKD Summary
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔬</span>Layer 1: Quantum Key Distribution</div>';
        html += `<span class="card-badge ${r.qkd.eavesdropper_detected ? 'badge-danger' : 'badge-secure'}">${r.qkd.eavesdropper_detected ? 'COMPROMISED' : 'SECURE'}</span></div>`;
        html += createDataGrid({
            'Qubits Sent': r.qkd.qubits_sent,
            'Sifted Key Length': r.qkd.sifted_key_length,
            'QBER': r.qkd.qber + '%',
            'Key Generated': r.qkd.key_generated ? '✅ Yes' : '❌ No',
        });
        if (r.qkd.steps) html += '<div style="margin-top:16px">' + createSteps(r.qkd.steps) + '</div>';
        html += '</div>';

        // Tensor Auth Layer
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🧊</span>Layer 2: Tensor-Isomorphism Authentication</div>';
        html += `<span class="card-badge ${r.auth.verified ? 'badge-secure' : 'badge-danger'}">${r.auth.verified ? 'TRANSCRIPT AUTHENTIC' : 'FORGED'}</span></div>`;
        html += createDataGrid(r.auth) + '</div>';

        // PQC Layer
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🛡️</span>Layer 3: Post-Quantum Cryptography</div>';
        html += '<span class="card-badge badge-quantum">Lattice-Based</span></div>';
        html += createDataGrid(r.pqc) + '</div>';

        // Hybrid Pipeline
        const hp = r.hybrid_pipeline;
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔗</span>Layer 4: Hybrid Key Derivation</div></div>';
        html += createDataGrid(hp.key_derivation) + '</div>';

        // Encryption result
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔒</span>Encryption Result (AES-256-GCM)</div>';
        html += '<span class="card-badge badge-secure">Verified</span></div>';
        html += createDataGrid(hp.encryption);
        html += '<div class="key-display" style="margin-top:12px"><strong>Ciphertext:</strong><br>' + hp.encryption.ciphertext_hex + '</div></div>';

        // Decryption
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔓</span>Decryption Verification</div>';
        html += `<span class="card-badge ${hp.decryption.integrity_verified ? 'badge-secure' : 'badge-danger'}">${hp.decryption.integrity_verified ? 'INTEGRITY OK' : 'FAILED'}</span></div>`;
        html += createDataGrid({
            'Success': hp.decryption.success ? '✅ Yes' : '❌ No',
            'Integrity Verified': hp.decryption.integrity_verified ? '✅ Yes' : '❌ No',
        });
        if (hp.decryption.plaintext_recovered) {
            html += '<div class="key-display"><strong>Recovered Plaintext:</strong><br>' + hp.decryption.plaintext_recovered + '</div>';
        }
        html += '</div>';

        // Summary
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">📊</span>Security Summary</div></div>';
        html += '<div class="data-grid">';
        hp.pipeline_summary.layers.forEach(layer => {
            html += `<div class="data-item"><span class="label">Layer</span><span class="value" style="color:var(--accent-teal)">${layer}</span></div>`;
        });
        html += `<div class="data-item"><span class="label">Total Layers</span><span class="value">${hp.pipeline_summary.total_security_layers}</span></div>`;
        html += `<div class="data-item"><span class="label">Quantum Safe</span><span class="value">${hp.pipeline_summary.quantum_safe ? '✅' : '❌'}</span></div>`;
        html += `<div class="data-item"><span class="label">Classical Safe</span><span class="value">${hp.pipeline_summary.classical_safe ? '✅' : '❌'}</span></div>`;
        html += '</div></div>';

        resultsEl.innerHTML = html;
    } catch (e) {
        resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-rose)">Error: ${e.message}</p></div>`;
    }
}

// ── Network ──────────────────────────────────
async function addNetworkNode() {
    const nodeId = document.getElementById('net-node-id').value || ('Node-' + Date.now().toString(36));
    const nodeType = document.getElementById('net-node-type').value;

    await fetch(API + '/api/network/add-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, node_type: nodeType })
    });
    refreshNetwork();
}

async function connectNodes() {
    const a = document.getElementById('net-connect-a').value;
    const b = document.getElementById('net-connect-b').value;
    const eve = document.getElementById('net-eve').checked;

    if (!a || !b) { alert('Enter both node IDs'); return; }

    const resultsEl = document.getElementById('network-results');
    showLoading(resultsEl);

    const res = await fetch(API + '/api/network/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_a: a, node_b: b, eavesdropper: eve })
    });
    const data = await res.json();
    const c = data.connection;

    let html = c.compromised
        ? '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">⚠️</span>Eve Detected: Link Compromised (messages will be blocked)</div></div>'
        : '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔗</span>Connection Established</div></div>';
    if (c.security_summary) {
        html += createDataGrid(c.security_summary);
    }
    if (c.layers) {
        html += '<div style="margin-top:16px">';
        c.layers.forEach(l => {
            html += `<div class="data-item" style="margin-bottom:4px"><span class="label">${l.name}</span><span class="value" style="color:${l.status === 'compromised' ? 'var(--accent-rose)' : 'var(--accent-green)'}">${l.status}</span></div>`;
        });
        html += '</div>';
    }
    html += '</div>';
    resultsEl.innerHTML = html;

    refreshNetwork();
}

function esc(t) {
    return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Node positions in % of the canvas, so layout works even while the tab is hidden.
let netPos = {};

async function refreshNetwork() {
    const res = await fetch(API + '/api/network/topology');
    const data = await res.json();
    const topo = data.topology;
    const nodes = topo.nodes;

    const canvas = document.getElementById('network-canvas');
    if (!nodes.length) return;
    canvas.innerHTML = '';

    netPos = {};
    nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        netPos[n.node_id] = { x: 50 + 35 * Math.cos(angle), y: 50 + 35 * Math.sin(angle) };
    });

    let svg = '<svg class="net-edges">';
    topo.edges.forEach(e => {
        const a = netPos[e.source], b = netPos[e.target];
        if (!a || !b) return;
        svg += `<line x1="${a.x}%" y1="${a.y}%" x2="${b.x}%" y2="${b.y}%" class="${e.compromised ? 'bad' : 'ok'}"/>`;
    });
    svg += '</svg>';
    canvas.insertAdjacentHTML('afterbegin', svg);

    topo.edges.filter(e => e.compromised).forEach(e => {
        const a = netPos[e.source], b = netPos[e.target];
        const eve = document.createElement('div');
        eve.className = 'net-eve';
        eve.style.left = (a.x + b.x) / 2 + '%';
        eve.style.top = (a.y + b.y) / 2 + '%';
        eve.title = 'Eve detected on this link';
        eve.textContent = '👁';
        canvas.appendChild(eve);
    });

    nodes.forEach(n => {
        const el = document.createElement('div');
        el.className = `network-node ${n.type}`;
        el.dataset.id = n.node_id;
        el.style.left = netPos[n.node_id].x + '%';
        el.style.top = netPos[n.node_id].y + '%';
        el.innerHTML = `<span>${n.type === 'quantum' ? '⚛️' : '💻'}</span><span>${esc(n.node_id)}</span>`;
        el.title = `${n.node_id} (${n.type}) - ${n.active_connections} connections`;
        canvas.appendChild(el);
    });

    const opts = nodes.map(n => `<option value="${esc(n.node_id)}">${esc(n.node_id)}</option>`).join('');
    ['net-connect-a', 'net-connect-b', 'net-send-from', 'net-send-to'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select node...</option>' + opts;
        if (prev) sel.value = prev;
    });

    document.getElementById('stat-nodes').textContent = topo.node_count;
    document.getElementById('stat-edges').textContent = topo.edge_count;
}

// ── Send message over the network ────────────
async function sendNetMessage() {
    const from = document.getElementById('net-send-from').value;
    const to = document.getElementById('net-send-to').value;
    const message = document.getElementById('net-send-msg').value;
    const btn = document.getElementById('net-send-btn');
    if (!from || !to || from === to) { alert('Pick two different nodes'); return; }
    if (!message.trim()) { alert('Type a message to send'); return; }

    btn.disabled = true;
    const res = await fetch(API + '/api/network/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, message })
    });
    const r = (await res.json()).result;

    await animatePacket(from, to, r);
    renderSendResult(r, message);
    btn.disabled = false;
}

function animatePacket(from, to, r) {
    const canvas = document.getElementById('network-canvas');
    const a = netPos[from], b = netPos[to];
    if (!a || !b) return Promise.resolve();

    const pkt = document.createElement('div');
    pkt.className = 'net-packet';
    pkt.textContent = '✉️';
    canvas.appendChild(pkt);

    const at = p => ({ left: p.x + '%', top: p.y + '%' });
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduced ? 0.01 : 1;
    const finish = (cls, label, p) => {
        pkt.classList.add(cls);
        pkt.textContent = cls === 'ok' ? '✅' : '✖';
        const tag = document.createElement('div');
        tag.className = `net-tag ${cls}`;
        tag.textContent = label;
        tag.style.left = p.x + '%';
        tag.style.top = p.y + '%';
        canvas.appendChild(tag);
        setTimeout(() => { pkt.remove(); tag.remove(); }, 4000);
    };

    if (r.delivered) {
        return pkt.animate([at(a), at(b)], { duration: 1600 * speed, easing: 'ease-in-out', fill: 'forwards' })
            .finished.then(() => {
                document.querySelector(`.network-node[data-id="${CSS.escape(to)}"]`)?.animate(
                    [{ boxShadow: '0 0 0 0 var(--accent-green-glow)' }, { boxShadow: '0 0 0 18px transparent' }],
                    { duration: 700 });
                finish('ok', 'Delivered', b);
            });
    }
    if (r.failed_at === 'Layer 1: BB84-QKD') {
        // Travels to Eve's spot on the link, gets caught, never reaches the receiver.
        return pkt.animate([at(a), at(mid)], { duration: 900 * speed, easing: 'ease-out', fill: 'forwards' })
            .finished.then(() => pkt.animate(
                [{ transform: 'translate(-50%,-50%)' }, { transform: 'translate(-30%,-50%)' }, { transform: 'translate(-70%,-50%)' }, { transform: 'translate(-50%,-50%)' }],
                { duration: 400 * speed, iterations: 2 }).finished)
            .then(() => finish('bad', `Blocked: Eve detected (QBER ${r.qber}%)`, mid));
    }
    // Not connected: packet can't leave the sender.
    return pkt.animate([at(a), at({ x: a.x + (b.x - a.x) * 0.15, y: a.y + (b.y - a.y) * 0.15 }), at(a)],
        { duration: 800 * speed, fill: 'forwards' }).finished.then(() => finish('bad', 'No connection', a));
}

function renderSendResult(r, message) {
    const steps = [];
    const failed = r.failed_at;
    const add = (name, ok, detail) => steps.push({ name, ok, detail });

    add('Connection', failed !== 'Connection' && failed !== 'Lookup',
        failed === 'Connection' || failed === 'Lookup' ? r.reason : `Link ${r.connection_id}`);
    if (failed === 'Layer 1: BB84-QKD') {
        add('Layer 1: BB84-QKD', false, r.reason);
    } else if (!failed) {
        add('Layer 1: BB84-QKD', true, r.quantum ? `QBER ${r.qber}% (below 11%), no eavesdropper` : 'Skipped: classical node, no quantum channel (PQC only)');
        add('Layer 2: Tensor-Auth', true, 'Peer public key signature verified');
        add('Layer 3: Lattice-KEM', true, 'Post-quantum shared secret in session key');
        add('Layer 4: AES-256-GCM', true, `Ciphertext ${r.encrypted.ciphertext_hex}`);
        add('Delivered', true, `${r.to} decrypted: "${r.decrypted}"`);
    }
    const allNames = ['Connection', 'Layer 1: BB84-QKD', 'Layer 2: Tensor-Auth', 'Layer 3: Lattice-KEM', 'Layer 4: AES-256-GCM', 'Delivered'];
    allNames.slice(steps.length).forEach(n => steps.push({ name: n, ok: null, detail: 'Not reached' }));

    const title = r.delivered ? `✅ Message delivered: ${r.from} → ${r.to}` : `⛔ Message NOT sent: ${r.from} → ${r.to}`;
    let html = `<div class="card send-result ${r.delivered ? 'ok' : 'bad'}"><div class="card-header"><div class="card-title">${esc(title)}</div></div>`;
    if (!r.delivered) html += `<p class="send-fail">Failed at <strong>${esc(failed)}</strong>: ${esc(r.reason)}</p>`;
    html += '<ol class="send-steps">';
    steps.forEach(s => {
        const cls = s.ok === null ? 'skip' : s.ok ? 'ok' : 'bad';
        const icon = s.ok === null ? '○' : s.ok ? '✓' : '✗';
        html += `<li class="${cls}"><span class="ico">${icon}</span><span class="nm">${esc(s.name)}</span><span class="dt">${esc(s.detail)}</span></li>`;
    });
    html += '</ol></div>';
    document.getElementById('network-results').innerHTML = html;
}

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    refreshNetwork();
});
