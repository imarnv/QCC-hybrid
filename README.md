# Advanced Quantum Cryptography Framework
## Objective 1: Design of a Quantum-Resilient Cryptographic Architecture

A proof-of-concept implementation of a **quantum-resilient cryptographic framework** for secure communication in quantum networks. This framework combines quantum mechanical concepts (superposition, entanglement) with state-of-the-art post-quantum cryptographic protocols.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Quantum-Resilient Crypto Framework          │
├─────────────┬──────────────────┬────────────────────────┤
│  Layer 1    │   Layer 2        │   Layer 3              │
│  QKD        │   Post-Quantum   │   Hybrid Integration   │
│  (BB84)     │   (Lattice-based)│   & Orchestration      │
├─────────────┼──────────────────┼────────────────────────┤
│ • Quantum   │ • CRYSTALS-Kyber │ • Key Fusion           │
│   Key Gen   │   Simulation     │ • Multi-layer Encrypt  │
│ • Basis     │ • Ring-LWE       │ • Classical + Quantum  │
│   Sifting   │   Key Exchange   │   Fallback             │
│ • QBER      │ • Lattice-based  │ • Adaptive Security    │
│   Detection │   Signatures     │   Level Selection      │
│ • Eaves-    │ • AES-256-GCM    │ • Dynamic Network      │
│   dropping  │   Symmetric Enc  │   Topology Support     │
│   Detection │                  │                        │
└─────────────┴──────────────────┴────────────────────────┘
```

## Features

- **BB84 Quantum Key Distribution Simulation**: Full simulation of the BB84 protocol including basis selection, quantum channel simulation, sifting, and eavesdropping detection via QBER analysis
- **Post-Quantum Cryptography (Lattice-Based)**: Simplified CRYSTALS-Kyber (ML-KEM) style key encapsulation using Ring-LWE
- **Hybrid Key Derivation**: Combines quantum-derived keys with post-quantum keys using HKDF for defense-in-depth
- **Multi-Layer Encryption**: End-to-end encryption using AES-256-GCM with quantum-safe key material
- **Eavesdropping Detection**: Statistical analysis of quantum bit error rate (QBER) to detect interception
- **Interactive Web Dashboard**: Real-time visualization of all protocol stages

## Quick Start

```bash
# Install dependencies
pip install flask flask-cors numpy pycryptodome

# Run the framework
python app.py

# Open dashboard
# Navigate to http://localhost:5000
```

## Project Structure

```
Quantum/
├── app.py                    # Flask web server & API
├── quantum_framework/
│   ├── __init__.py
│   ├── bb84_qkd.py          # BB84 QKD protocol simulation
│   ├── post_quantum.py       # Lattice-based PQC (Kyber-like)
│   ├── hybrid_crypto.py      # Hybrid key derivation & encryption
│   └── network_node.py       # Network node abstraction
├── templates/
│   └── index.html            # Web dashboard
├── static/
│   ├── css/
│   │   └── style.css         # Dashboard styling
│   └── js/
│       └── dashboard.js      # Dashboard interactivity
├── requirements.txt
└── README.md
```
