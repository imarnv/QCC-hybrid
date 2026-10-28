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

        // PQC Layer
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🛡️</span>Layer 2: Post-Quantum Cryptography</div>';
        html += '<span class="card-badge badge-quantum">Lattice-Based</span></div>';
        html += createDataGrid(r.pqc) + '</div>';

        // Hybrid Pipeline
        const hp = r.hybrid_pipeline;
        html += '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔗</span>Layer 3: Hybrid Key Derivation</div></div>';
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

    let html = '<div class="card"><div class="card-header"><div class="card-title"><span class="icon">🔗</span>Connection Established</div></div>';
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

async function refreshNetwork() {
    const res = await fetch(API + '/api/network/topology');
    const data = await res.json();
    const topo = data.topology;

    // Update canvas
    const canvas = document.getElementById('network-canvas');
    canvas.innerHTML = '';

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const nodes = topo.nodes;

    // SVG for edges
    let svg = `<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;">`;

    const positions = {};
    nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        const rx = w * 0.35;
        const ry = h * 0.35;
        const x = w / 2 + rx * Math.cos(angle) - 30;
        const y = h / 2 + ry * Math.sin(angle) - 30;
        positions[n.node_id] = { x: x + 30, y: y + 30 };

        const el = document.createElement('div');
        el.className = `network-node ${n.type}`;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.innerHTML = `<span>${n.type === 'quantum' ? '⚛️' : '💻'}</span><span>${n.node_id}</span>`;
        el.title = `${n.node_id} (${n.type}) - ${n.active_connections} connections`;
        canvas.appendChild(el);
    });

    topo.edges.forEach(e => {
        const a = positions[e.source];
        const b = positions[e.target];
        if (a && b) {
            svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(99,102,241,0.4)" stroke-width="2" stroke-dasharray="6,4"/>`;
        }
    });

    svg += '</svg>';
    canvas.insertAdjacentHTML('afterbegin', svg);

    // Update dropdowns
    const selA = document.getElementById('net-connect-a');
    const selB = document.getElementById('net-connect-b');
    if (selA && selB) {
        const opts = nodes.map(n => `<option value="${n.node_id}">${n.node_id}</option>`).join('');
        const prevA = selA.value, prevB = selB.value;
        selA.innerHTML = '<option value="">Select node...</option>' + opts;
        selB.innerHTML = '<option value="">Select node...</option>' + opts;
        if (prevA) selA.value = prevA;
        if (prevB) selB.value = prevB;
    }

    document.getElementById('stat-nodes').textContent = topo.node_count;
    document.getElementById('stat-edges').textContent = topo.edge_count;
}

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    refreshNetwork();
});
