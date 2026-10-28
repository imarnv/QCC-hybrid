"""
Advanced Quantum Cryptography Framework
========================================
Objective 1: Design of a Quantum-Resilient Cryptographic Architecture

This framework combines quantum key distribution (BB84) with post-quantum
cryptographic protocols (lattice-based) to create a hybrid security system
resilient against both classical and quantum computing attacks.
"""

from .bb84_qkd import BB84Protocol
from .post_quantum import LatticeKEM, LatticeSigner
from .hybrid_crypto import HybridCryptoEngine
from .network_node import QuantumNode, QuantumNetwork

__version__ = "1.0.0"
__all__ = [
    "BB84Protocol",
    "LatticeKEM",
    "LatticeSigner",
    "HybridCryptoEngine",
    "QuantumNode",
    "QuantumNetwork",
]
