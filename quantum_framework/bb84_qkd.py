"""
BB84 Quantum Key Distribution Protocol Simulation
"""

import numpy as np
import hashlib
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict

RECTILINEAR = 0
DIAGONAL = 1
BASIS_NAMES = {RECTILINEAR: "Rectilinear (+)", DIAGONAL: "Diagonal (x)"}


@dataclass
class BB84Result:
    """Complete result of a BB84 protocol run."""
    num_qubits_sent: int
    alice_bits: List[int]
    alice_bases: List[int]
    bob_bases: List[int]
    bob_measurements: List[int]
    sifted_key_alice: List[int]
    sifted_key_bob: List[int]
    sifted_indices: List[int]
    qber: float
    eavesdropper_detected: bool
    eavesdropper_present: bool
    final_key: Optional[str]
    final_key_length: int
    protocol_steps: List[Dict]
    timing: Dict[str, float]
    error_positions: List[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "num_qubits_sent": self.num_qubits_sent,
            "alice_bits": self.alice_bits[:50],
            "alice_bases": [BASIS_NAMES[b] for b in self.alice_bases[:50]],
            "bob_bases": [BASIS_NAMES[b] for b in self.bob_bases[:50]],
            "bob_measurements": self.bob_measurements[:50],
            "sifted_key_length": len(self.sifted_key_alice),
            "sifted_key_alice": self.sifted_key_alice[:50],
            "sifted_key_bob": self.sifted_key_bob[:50],
            "qber": round(self.qber, 6),
            "qber_percentage": round(self.qber * 100, 2),
            "eavesdropper_detected": self.eavesdropper_detected,
            "eavesdropper_present": self.eavesdropper_present,
            "final_key": self.final_key,
            "final_key_length": self.final_key_length,
            "protocol_steps": self.protocol_steps,
            "timing": {k: round(v, 6) for k, v in self.timing.items()},
            "error_positions": self.error_positions[:20],
            "security_status": "COMPROMISED" if self.eavesdropper_detected else "SECURE",
            "basis_match_rate": round(len(self.sifted_key_alice) / max(self.num_qubits_sent, 1) * 100, 2),
        }


class BB84Protocol:
    """Complete BB84 QKD Protocol Simulation."""

    QBER_THRESHOLD = 0.11

    def __init__(self, num_qubits: int = 256, seed: Optional[int] = None):
        self.num_qubits = num_qubits
        self.rng = np.random.default_rng(seed)
        self._steps = []

    def _log_step(self, phase: str, description: str, details: dict = None):
        self._steps.append({
            "phase": phase,
            "description": description,
            "details": details or {},
            "timestamp": time.time()
        })

    def run(self, eavesdropper: bool = False, eve_intercept_rate: float = 1.0) -> BB84Result:
        self._steps = []
        timing = {}

        # Phase 1: Arnav prepares qubits
        t0 = time.time()
        alice_bits = self.rng.integers(0, 2, size=self.num_qubits).tolist()
        alice_bases = self.rng.integers(0, 2, size=self.num_qubits).tolist()
        timing["preparation"] = time.time() - t0
        self._log_step("Preparation", f"Arnav prepared {self.num_qubits} qubits with random bits and bases")

        # Phase 2: Quantum channel (with optional Eve)
        t1 = time.time()
        transmitted_bits = alice_bits.copy()
        if eavesdropper:
            eve_count = 0
            for i in range(self.num_qubits):
                if self.rng.random() < eve_intercept_rate:
                    eve_count += 1
                    eve_basis = self.rng.integers(0, 2)
                    if eve_basis != alice_bases[i]:
                        if self.rng.random() < 0.5:
                            transmitted_bits[i] = 1 - transmitted_bits[i]
            self._log_step("Eavesdropping", f"Eve intercepted {eve_count}/{self.num_qubits} qubits")
        timing["transmission"] = time.time() - t1
        self._log_step("Transmission", f"Qubits sent through {'intercepted' if eavesdropper else 'secure'} channel")

        # Phase 3: Monesh measures
        t2 = time.time()
        bob_bases = self.rng.integers(0, 2, size=self.num_qubits).tolist()
        bob_measurements = []
        for i in range(self.num_qubits):
            if bob_bases[i] == alice_bases[i]:
                bob_measurements.append(transmitted_bits[i])
            else:
                bob_measurements.append(int(self.rng.integers(0, 2)))
        timing["measurement"] = time.time() - t2
        self._log_step("Measurement", f"Monesh measured {self.num_qubits} qubits")

        # Phase 4: Sifting
        t3 = time.time()
        sifted_alice, sifted_bob, sifted_idx = [], [], []
        for i in range(self.num_qubits):
            if alice_bases[i] == bob_bases[i]:
                sifted_alice.append(alice_bits[i])
                sifted_bob.append(bob_measurements[i])
                sifted_idx.append(i)
        timing["sifting"] = time.time() - t3
        self._log_step("Sifting", f"Kept {len(sifted_alice)}/{self.num_qubits} matching-basis bits")

        # Phase 5: QBER estimation
        t4 = time.time()
        sample_size = max(min(len(sifted_alice) // 4, 50), 1)
        sample_indices = self.rng.choice(len(sifted_alice), size=sample_size, replace=False).tolist()
        errors = sum(1 for idx in sample_indices if sifted_alice[idx] != sifted_bob[idx])
        error_positions = [sifted_idx[idx] for idx in sample_indices if sifted_alice[idx] != sifted_bob[idx]]
        qber = errors / sample_size if sample_size > 0 else 0.0
        eavesdropper_detected = qber > self.QBER_THRESHOLD
        remaining = sorted(set(range(len(sifted_alice))) - set(sample_indices))
        final_alice = [sifted_alice[i] for i in remaining]
        timing["qber_estimation"] = time.time() - t4
        status = "EAVESDROPPER DETECTED" if eavesdropper_detected else "Channel secure"
        self._log_step("QBER Estimation", f"QBER: {qber*100:.2f}% (threshold: 11%) - {status}")

        # Phase 6: Privacy amplification
        t5 = time.time()
        final_key = None
        final_key_length = 0
        if not eavesdropper_detected and len(final_alice) > 0:
            key_bits = ''.join(str(b) for b in final_alice)
            final_key = hashlib.sha256(key_bits.encode()).hexdigest()
            final_key_length = 256
            self._log_step("Privacy Amplification", f"Generated {final_key_length}-bit key via SHA-256")
        else:
            self._log_step("Privacy Amplification", "Key generation ABORTED")
        timing["privacy_amplification"] = time.time() - t5
        timing["total"] = sum(timing.values())

        return BB84Result(
            num_qubits_sent=self.num_qubits, alice_bits=alice_bits,
            alice_bases=alice_bases, bob_bases=bob_bases,
            bob_measurements=bob_measurements, sifted_key_alice=sifted_alice,
            sifted_key_bob=sifted_bob, sifted_indices=sifted_idx,
            qber=qber, eavesdropper_detected=eavesdropper_detected,
            eavesdropper_present=eavesdropper, final_key=final_key,
            final_key_length=final_key_length, protocol_steps=self._steps,
            timing=timing, error_positions=error_positions,
        )
