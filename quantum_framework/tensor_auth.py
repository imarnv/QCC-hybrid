"""
Tensor-Isomorphism Authentication Layer ("Cuboid" Cryptography)
================================================================
Post-quantum signatures from the Tensor Isomorphism (TI) problem.

The key object is a 3D cube of numbers T[i][j][k] over F_q. A secret triple of
invertible matrices (A, B, C) "twists" the cube along each of its three axes:

    T'[i,j,k] = sum_{a,b,c} A[i,a] * B[j,b] * C[k,c] * T[a,b,c]   (mod q)

Given T and T', recovering (A, B, C) is the Tensor Isomorphism problem, which
has no known efficient quantum algorithm (it is not a hidden-subgroup problem
over an abelian group, so Shor does not apply).

Signature = Fiat-Shamir transform of the GMW-style identification protocol.

References:
  - Ji, Qiao, Song, Yun. "General Linear Group Action on Tensors: A Candidate
    for Post-Quantum Cryptography." TCC 2019.
  - Tang, Duong, Joux, Plantard, Qiao, Susilo. "Practical Post-Quantum Signature
    Schemes from Isomorphism Problems of Trilinear Forms." EUROCRYPT 2022 (ALTEQ).
  - Chou et al. "Take your MEDS: Digital Signatures from Matrix Code Equivalence."
    AFRICACRYPT 2023.

Toy parameters for demonstration only; real schemes use n >= 13, q ~ 2^32.
"""

import hashlib
import time
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple

Action = Tuple[np.ndarray, np.ndarray, np.ndarray]


@dataclass
class TensorKeyPair:
    t0: np.ndarray       # public base cube
    t1: np.ndarray       # public twisted cube = secret . t0
    secret: Action       # (A, B, C)


class TensorSigner:
    """Fiat-Shamir signature over the tensor isomorphism group action."""

    def __init__(self, n: int = 8, q: int = 251, rounds: int = 64):
        self.n, self.q, self.rounds = n, q, rounds
        self.rng = np.random.default_rng()

    def _random_invertible(self) -> np.ndarray:
        # ponytail: L*U is always invertible but not exactly uniform over GL(n, q);
        # sample uniformly + rank check if the zero-knowledge proof must be tight.
        n, q = self.n, self.q
        L = np.tril(self.rng.integers(0, q, (n, n)), -1) + np.eye(n, dtype=np.int64)
        U = np.triu(self.rng.integers(0, q, (n, n)), 1) + np.diag(self.rng.integers(1, q, n))
        return (L @ U) % q

    def _random_action(self) -> Action:
        return tuple(self._random_invertible() for _ in range(3))

    def act(self, g: Action, t: np.ndarray) -> np.ndarray:
        """Twist the cube along all three axes."""
        A, B, C = g
        t = np.einsum("ia,abc->ibc", A, t) % self.q
        t = np.einsum("jb,ibc->ijc", B, t) % self.q
        return np.einsum("kc,ijc->ijk", C, t) % self.q

    def _compose(self, h: Action, g: Action) -> Action:
        """(h o g) . T == h . (g . T)"""
        return tuple((hm @ gm) % self.q for hm, gm in zip(h, g))

    def _challenge(self, message: bytes, kp_pub: Tuple[np.ndarray, np.ndarray], commits: List[np.ndarray]) -> bytes:
        h = hashlib.sha256(message)
        for t in (*kp_pub, *commits):
            h.update(t.astype(np.int64).tobytes())
        return h.digest()

    def _bits(self, digest: bytes) -> List[int]:
        stream = hashlib.shake_256(digest).digest((self.rounds + 7) // 8)
        return [(stream[i // 8] >> (i % 8)) & 1 for i in range(self.rounds)]

    def keygen(self) -> TensorKeyPair:
        t0 = self.rng.integers(0, self.q, (self.n,) * 3)
        g = self._random_action()
        return TensorKeyPair(t0=t0, t1=self.act(g, t0), secret=g)

    def sign(self, kp: TensorKeyPair, message: bytes) -> Dict:
        # Commit: S_i = h_i . T1 for fresh random h_i
        hs = [self._random_action() for _ in range(self.rounds)]
        commits = [self.act(h, kp.t1) for h in hs]
        digest = self._challenge(message, (kp.t0, kp.t1), commits)
        # Respond: bit 0 -> reveal h_i ; bit 1 -> reveal h_i o g (maps T0 to S_i)
        responses = [h if c == 0 else self._compose(h, kp.secret) for h, c in zip(hs, self._bits(digest))]
        return {"digest": digest, "responses": responses}

    def verify(self, t0: np.ndarray, t1: np.ndarray, message: bytes, sig: Dict) -> bool:
        bits = self._bits(sig["digest"])
        commits = [self.act(r, t1 if c == 0 else t0) for r, c in zip(sig["responses"], bits)]
        return self._challenge(message, (t0, t1), commits) == sig["digest"]

    def sizes(self) -> Dict:
        n = self.n
        return {
            "public_key_bytes": 2 * n ** 3,             # two cubes, 1 byte per entry (q < 256)
            "secret_key_bytes": 3 * n * n,
            "signature_bytes": 32 + self.rounds * 3 * n * n,
        }

    def get_info(self) -> Dict:
        return {
            "algorithm": f"TI-Sign (n={self.n}, q={self.q}, rounds={self.rounds})",
            "type": "Digital Signature / Authentication",
            "hard_problem": "Tensor Isomorphism (3-tensor GL x GL x GL action)",
            "research_basis": "Ji-Qiao-Song-Yun TCC'19, ALTEQ EUROCRYPT'22, MEDS AFRICACRYPT'23",
            "soundness_bits": self.rounds,
            "quantum_safe": True,
            "status": "Research-stage (not in any deployed standard)",
        }

    def demo(self, message: bytes) -> Dict:
        """Keygen, sign, verify, and two forgery attempts - for the dashboard."""
        t_0 = time.time()
        kp = self.keygen()
        t_1 = time.time()
        sig = self.sign(kp, message)
        t_2 = time.time()
        valid = self.verify(kp.t0, kp.t1, message, sig)
        t_3 = time.time()
        attacker = self.keygen()
        return {
            "info": self.get_info(),
            "sizes": self.sizes(),
            "cube_before": kp.t0.tolist(),
            "cube_after": kp.t1.tolist(),
            "secret_A_preview": kp.secret[0][:3, :3].tolist(),
            "signature_digest": sig["digest"].hex(),
            "verification": {
                "genuine_signature": valid,
                "tampered_message": self.verify(kp.t0, kp.t1, message + b"!", sig),
                "attacker_public_key": self.verify(attacker.t0, attacker.t1, message, sig),
            },
            "timing_ms": {
                "keygen": round((t_1 - t_0) * 1000, 2),
                "sign": round((t_2 - t_1) * 1000, 2),
                "verify": round((t_3 - t_2) * 1000, 2),
            },
        }


if __name__ == "__main__":
    s = TensorSigner()
    kp = s.keygen()
    g = kp.secret
    h = s._random_action()
    assert np.array_equal(s.act(s._compose(h, g), kp.t0), s.act(h, kp.t1)), "composition broken"
    sig = s.sign(kp, b"hello")
    assert s.verify(kp.t0, kp.t1, b"hello", sig)
    assert not s.verify(kp.t0, kp.t1, b"hellO", sig)
    other = s.keygen()
    assert not s.verify(other.t0, other.t1, b"hello", sig)
    print("tensor_auth self-check OK", s.sizes())
