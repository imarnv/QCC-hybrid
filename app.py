"""
Quantum-Resilient Cryptographic Framework — Web API & Dashboard
================================================================
Flask application providing REST API and interactive web dashboard
for demonstrating Objective 1: Quantum-Resilient Cryptographic Architecture.
"""

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from quantum_framework import BB84Protocol, LatticeKEM, LatticeSigner, HybridCryptoEngine
from quantum_framework.network_node import QuantumNetwork
import time

app = Flask(__name__)
CORS(app)

# Global network instance
network = QuantumNetwork("Quantum-Resilient Demo Network")


@app.route("/")
def dashboard():
    return render_template("index.html")


# ────────────────── BB84 QKD API ──────────────────

@app.route("/api/bb84/run", methods=["POST"])
def run_bb84():
    """Run BB84 QKD protocol simulation."""
    data = request.get_json() or {}
    num_qubits = data.get("num_qubits", 256)
    eavesdropper = data.get("eavesdropper", False)
    eve_rate = data.get("eve_intercept_rate", 1.0)

    protocol = BB84Protocol(num_qubits=min(num_qubits, 2048))
    result = protocol.run(eavesdropper=eavesdropper, eve_intercept_rate=eve_rate)
    return jsonify({"success": True, "result": result.to_dict()})


# ────────────────── Post-Quantum Crypto API ──────────────────

@app.route("/api/pqc/keygen", methods=["POST"])
def pqc_keygen():
    """Generate lattice-based KEM key pair."""
    data = request.get_json() or {}
    level = data.get("security_level", 3)

    kem = LatticeKEM(security_level=min(level, 3))
    t0 = time.time()
    keypair = kem.keygen()
    gen_time = time.time() - t0

    return jsonify({
        "success": True,
        "result": {
            "algorithm_info": kem.get_info(),
            "public_key_hex": keypair.public_key.hex()[:64] + "...",
            "public_key_size_bytes": len(keypair.public_key),
            "secret_key_size_bytes": len(keypair.secret_key),
            "params": keypair.params,
            "generation_time_ms": round(gen_time * 1000, 2),
        }
    })


@app.route("/api/pqc/kem-demo", methods=["POST"])
def pqc_kem_demo():
    """Demonstrate full KEM encapsulation/decapsulation."""
    data = request.get_json() or {}
    level = data.get("security_level", 3)

    kem = LatticeKEM(security_level=min(level, 3))
    keypair = kem.keygen()

    t0 = time.time()
    ct = kem.encapsulate(keypair.public_key)
    encap_time = time.time() - t0

    t1 = time.time()
    recovered = kem.decapsulate(keypair.secret_key, ct.ciphertext)
    decap_time = time.time() - t1

    return jsonify({
        "success": True,
        "result": {
            "algorithm_info": kem.get_info(),
            "encapsulation": {
                "ciphertext_size_bytes": len(ct.ciphertext),
                "shared_secret_hex": ct.shared_secret.hex(),
                "time_ms": round(encap_time * 1000, 2),
            },
            "decapsulation": {
                "recovered_secret_hex": recovered.hex(),
                "time_ms": round(decap_time * 1000, 2),
            },
            "key_sizes": keypair.params,
        }
    })


# ────────────────── Hybrid Encryption API ──────────────────

@app.route("/api/hybrid/encrypt", methods=["POST"])
def hybrid_encrypt():
    """Full hybrid encryption pipeline: BB84 + Lattice-KEM + HKDF + AES-256-GCM."""
    data = request.get_json() or {}
    message = data.get("message", "Hello, Quantum World!")
    num_qubits = data.get("num_qubits", 256)
    eavesdropper = data.get("eavesdropper", False)

    # Step 1: BB84 QKD
    bb84 = BB84Protocol(num_qubits=min(num_qubits, 1024))
    qkd_result = bb84.run(eavesdropper=eavesdropper)

    # Step 2: Lattice-KEM
    kem = LatticeKEM(security_level=3)
    keypair = kem.keygen()
    kem_ct = kem.encapsulate(keypair.public_key)

    # Step 3: Hybrid pipeline
    engine = HybridCryptoEngine()
    pipeline_result = engine.full_pipeline(
        message=message,
        qkd_key=qkd_result.final_key or None,
        pqc_secret=kem_ct.shared_secret,
    )

    return jsonify({
        "success": True,
        "result": {
            "qkd": {
                "qubits_sent": qkd_result.num_qubits_sent,
                "sifted_key_length": len(qkd_result.sifted_key_alice),
                "qber": round(qkd_result.qber * 100, 2),
                "eavesdropper_detected": qkd_result.eavesdropper_detected,
                "key_generated": qkd_result.final_key is not None,
                "steps": qkd_result.protocol_steps,
            },
            "pqc": kem.get_info(),
            "hybrid_pipeline": pipeline_result,
        }
    })


# ────────────────── Network API ──────────────────

@app.route("/api/network/topology", methods=["GET"])
def get_topology():
    return jsonify({"success": True, "topology": network.get_topology()})


@app.route("/api/network/add-node", methods=["POST"])
def add_node():
    data = request.get_json() or {}
    node_id = data.get("node_id", f"node-{len(network.nodes)+1}")
    node_type = data.get("node_type", "quantum")
    level = data.get("security_level", 3)
    status = network.add_node(node_id, node_type, level)
    return jsonify({"success": True, "node": status})


@app.route("/api/network/connect", methods=["POST"])
def connect_nodes():
    data = request.get_json() or {}
    a = data.get("node_a")
    b = data.get("node_b")
    qubits = data.get("num_qubits", 256)
    eve = data.get("eavesdropper", False)
    if not a or not b:
        return jsonify({"success": False, "error": "Provide node_a and node_b"}), 400
    result = network.connect_nodes(a, b, qubits, eve)
    return jsonify({"success": True, "connection": result})


@app.route("/api/network/send", methods=["POST"])
def send_message():
    data = request.get_json() or {}
    result = network.send_message(data.get("from"), data.get("to"), data.get("message", "test"))
    return jsonify({"success": True, "result": result})


@app.route("/api/framework/info", methods=["GET"])
def framework_info():
    return jsonify({
        "framework": "Quantum-Resilient Cryptographic Architecture",
        "version": "1.0.0",
        "objective": "Design of a Quantum-Resilient Cryptographic Architecture",
        "components": {
            "quantum_layer": {
                "protocol": "BB84 QKD",
                "features": ["Qubit Preparation", "Basis Sifting", "QBER Detection", "Privacy Amplification"],
            },
            "post_quantum_layer": {
                "kem": "Lattice-KEM (CRYSTALS-Kyber inspired)",
                "signatures": "Lattice-DSA (CRYSTALS-Dilithium inspired)",
                "basis": "Ring-LWE / Module-LWE",
            },
            "hybrid_layer": {
                "key_derivation": "HKDF-SHA256",
                "encryption": "AES-256-GCM",
                "approach": "Defense-in-depth (QKD + PQC + Classical)",
            },
            "network_layer": {
                "node_types": ["Quantum", "Classical"],
                "topology": "Dynamic mesh",
                "fallback": "Classical-only with PQC",
            },
        },
    })


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  Quantum-Resilient Cryptographic Framework")
    print("  Objective 1: POC Dashboard")
    print("=" * 60)
    print("  Dashboard: http://localhost:5001")
    print("  API Docs:  http://localhost:5001/api/framework/info")
    print("=" * 60 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5001)
