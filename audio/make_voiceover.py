"""
Generate the 2:00 voice-over with the Gemini Live (realtime) model, one clip per
sync point, and place each clip on its exact timeline second so it lines up
with the video.

Each line gets its own short Live session (no memory of other lines, so the
model can't ad-lib the story; the fixed voice name keeps the sound consistent).
The tone goes in the system instruction, never in the spoken text. The model's
own output transcription is checked against the script and the line is retried
if it paraphrased or chatted.

    python3 audio/make_voiceover.py            # generate missing clips + assemble
    python3 audio/make_voiceover.py --assemble # re-assemble from existing clips
    (delete audio/segments/NN_i.wav to regenerate just that line)

Key: GEMINI_API_KEY env var, else read from ~/Desktop/eloquent/.env
Out: audio/segments/*.wav, audio/vo_01.wav ... vo_13.wav, audio/voiceover_full.wav (48 kHz)
"""

import asyncio, base64, difflib, json, os, re, subprocess, sys, wave
from pathlib import Path
import aiohttp

MODEL = "gemini-3.1-flash-live-preview"
VOICE = "Charon"            # informative, mid-low. Try "Orus" or "Algenib" for alternatives.
RATE = 24000                # Live API returns 24 kHz 16-bit mono PCM
TOTAL = 120.0
GAP = 0.12                  # min silence between clips if one overruns
MAX_TEMPO = 1.25            # max speed-up before flagging a clip as too long
MAX_PAUSE = 0.3             # pauses inside a line are shortened to this
PARALLEL = 2                # Live sessions at once (free tier rejects more)
MATCH = 0.8                 # min transcript similarity to accept a take
OUT = Path(__file__).parent
SEG = OUT / "segments"
WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"

SYSTEM = (
    "You are a professional documentary voice-over narrator: confident, calm, warm "
    "mid-low pitch, no hype, clean studio delivery, at a brisk natural pace of about 170 "
    "words per minute with no dramatic pauses inside a line. You are NOT a chat assistant. "
    "The user message is a script line. Speak that line exactly, word for word, then "
    "stop. Never add, drop, reorder or explain words; never greet, comment or reply. "
    "Speak this line in this tone: "
)

# (block, block_start, block_end, tone, [(sync_time, text), ...])
SCRIPT = [
    (1, 0.3, 7.7, "slightly ominous, serious, brisk", [
        (0.3, "A large quantum computer breaks the encryption that protects the internet today,"),
        (4.0, "and attackers can record our data now... to decrypt it later.")]),
    (2, 8.2, 13.6, "lifting, a confident reveal that brightens on 'four layers'", [
        (8.2, "So we built a quantum-resilient framework:"),
        (10.6, "four layers, each based on a different kind of hardness.")]),
    (3, 14.2, 23.6, "clear, crisp and explanatory, with a small smile on the last sentence", [
        (14.2, "Layer one: B-B-eighty-four quantum key distribution."),
        (16.8, "Arnav sends photons in random bases; Prince measures in his own."),
        (20.8, "They keep only the matches. That's a shared secret key.")]),
    (4, 24.2, 33.6, "tense and firm", [
        (24.2, "If Eve listens, physics betrays her: measuring a photon disturbs it."),
        (28.6, "The error rate jumps past eleven percent, and the key is thrown away.")]),
    (5, 34.2, 39.6, "matter-of-fact and slightly quick, like a live demo", [
        (34.2, "In our dashboard: zero percent error without Eve,"),
        (37.0, "and the key aborted the moment she appears.")]),
    (6, 40.2, 51.6, "curious and quietly excited, rhythmic", [
        (40.2, "But B-B-eighty-four's public discussion can be faked."),
        (42.6, "So we add a new, research-stage layer: cube cryptography."),
        (46.4, "A public eight-by-eight-by-eight cube of numbers is twisted along all three axes by a secret key.")]),
    (7, 52.2, 61.6, "mysterious on the maze, then decisive on the seal", [
        (52.2, "Undoing that twist is the tensor isomorphism problem,"),
        (55.0, "a maze for classical and quantum computers alike."),
        (57.4, "A zero-knowledge signature seals the transcript, and any tampering breaks the seal.")]),
    (8, 62.2, 66.6, "crisp and confident, two short statements", [
        (62.2, "Genuine signature accepted. ... Forgeries rejected.")]),
    (9, 67.2, 77.6, "a sense of wonder, airy", [
        (67.2, "Layer three: lattices, the maths behind NIST's M-L-kem standard."),
        (72.2, "Hide a secret point in an infinite grid, and blur it with noise.")]),
    (10, 78.2, 91.6, "a gentle build, ending with satisfied resolve", [
        (78.2, "In two dimensions, you'd find it instantly."),
        (81.6, "In hundreds of dimensions, not even a quantum computer can."),
        (86.4, "Yet the key holder snaps every noisy bit back into place.")]),
    (11, 92.2, 99.6, "confident and technical, then reassuring on the last line", [
        (92.2, "Layer four fuses the keys into one A-E-S two-fifty-six session key."),
        (96.4, "Lose the quantum layer, and the others still hold.")]),
    (12, 100.2, 107.6, "quietly proud, demo pace", [
        (100.2, "Full pipeline, Eve on, and the message still decrypts."),
        (104.4, "Across the network, every link is authenticated.")]),
    (13, 108.2, 115.8, "warm, low and conclusive, natural phrasing", [
        (108.2, "Physics. Geometry. Lattices. Encryption.", "emphatic, a short beat after each word"),
        (111.4, "Breaking one isn't enough."),
        (113.4, "Defense in depth for the quantum era.")]),
]


def api_key() -> str:
    if os.getenv("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    for line in (Path.home() / "Desktop/eloquent/.env").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("GEMINI_API_KEY not found")


def words(s: str):
    # spoken forms vary ("BB84" vs "B-B-eighty-four"), so compare letters only
    return re.sub(r"[^a-z ]", " ", s.lower().replace("-", " ")).split()


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, words(a), words(b)).ratio()


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def write_wav(path: Path, pcm: bytes, rate: int = RATE):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


def trim(src: Path, dst: Path):
    """Strip leading/trailing silence (clip starts exactly on its sync time) and
    shorten long pauses inside the line to MAX_PAUSE."""
    edge = "silenceremove=start_periods=1:start_threshold=-45dB"
    inner = f"silenceremove=stop_periods=-1:stop_duration={MAX_PAUSE}:stop_threshold=-40dB:stop_silence={MAX_PAUSE}"
    f = f"{edge},areverse,{edge},areverse,{inner}"
    ffmpeg("-i", str(src), "-af", f, "-ar", str(RATE), "-ac", "1", str(dst))


async def speak(http, key: str, tone: str, text: str):
    """One fresh Live session per line: returns (pcm, model's own transcript)."""
    setup = {"setup": {
        "model": f"models/{MODEL}",
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
        "systemInstruction": {"parts": [{"text": SYSTEM + tone + "."}]},
        "outputAudioTranscription": {},
    }}
    async with http.ws_connect(f"{WS}?key={key}", max_msg_size=0) as ws:
        await ws.send_json(setup)
        await ws.receive()  # setupComplete
        return await _turn(ws, text)


async def _turn(ws, text: str):
    await ws.send_json({"clientContent": {
        "turns": [{"role": "user", "parts": [{"text": text}]}],
        "turnComplete": True}})
    pcm, said = bytearray(), ""
    while True:
        msg = await asyncio.wait_for(ws.receive(), timeout=60)
        if msg.type not in (aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.BINARY):
            raise RuntimeError(f"Live socket closed: {msg.type} {msg.data} {msg.extra}")
        sc = json.loads(msg.data).get("serverContent", {})
        for p in sc.get("modelTurn", {}).get("parts", []):
            if "inlineData" in p:
                pcm += base64.b64decode(p["inlineData"]["data"])
        said += sc.get("outputTranscription", {}).get("text", "")
        if sc.get("turnComplete"):
            return bytes(pcm), said.strip()


async def generate():
    SEG.mkdir(parents=True, exist_ok=True)
    todo = [(b, i, (seg[2] if len(seg) > 2 else tone), seg[1]) for b, _, _, tone, segs in SCRIPT
            for i, seg in enumerate(segs) if not (SEG / f"{b:02d}_{i}.wav").exists()]
    if not todo:
        return
    key, gate = api_key(), asyncio.Semaphore(PARALLEL)

    async def one(http, b, i, tone, text):
        async with gate:
            for attempt in range(5):
                try:
                    pcm, said = await speak(http, key, tone, text)
                except Exception as e:
                    pcm, said = b"", f"error: {e}"
                    await asyncio.sleep(3)
                score = similarity(text, said)
                ok = pcm and score >= MATCH
                print(f"  {b:02d}.{i} try {attempt + 1}: {score:.2f}  \"{said}\"" + ("" if ok else "  <-- retry"), flush=True)
                if ok:
                    break
            else:
                print(f"  !! {b:02d}.{i} never matched; keeping last take, check it by ear", flush=True)
            if pcm:
                raw = SEG / f"{b:02d}_{i}_raw.wav"
                write_wav(raw, pcm)
                trim(raw, SEG / f"{b:02d}_{i}.wav")

    async with aiohttp.ClientSession() as http:
        await asyncio.gather(*(one(http, *t) for t in todo))


def read_pcm(path: Path) -> bytes:
    with wave.open(str(path)) as w:
        return w.readframes(w.getnframes())


def assemble():
    timeline = bytearray(int(TOTAL * RATE) * 2)
    report, prev_end = [], 0.0
    for block, b_start, b_end, _, segs in SCRIPT:
        block_buf = bytearray(int((b_end - b_start + 1.0) * RATE) * 2)
        for i, (sync, *_) in enumerate(segs):
            clip = SEG / f"{block:02d}_{i}.wav"
            # window = until next sync point in this block, else block end
            window_end = segs[i + 1][0] if i + 1 < len(segs) else b_end
            start = max(sync, prev_end + GAP)
            dur = duration(clip)
            tempo = dur / max(window_end - sync - GAP, 0.1)
            if tempo > 1.0:
                fitted = SEG / f"{block:02d}_{i}_fit.wav"
                ffmpeg("-i", str(clip), "-filter:a", f"atempo={min(tempo, MAX_TEMPO):.4f}", str(fitted))
                clip, dur = fitted, duration(fitted)
            pcm = read_pcm(clip)
            off = int(start * RATE) * 2
            timeline[off:off + len(pcm)] = pcm[:max(0, len(timeline) - off)]
            boff = int((start - b_start) * RATE) * 2
            block_buf[boff:boff + len(pcm)] = pcm[:max(0, len(block_buf) - boff)]
            prev_end = start + dur
            flag = ""
            if start - sync > 0.05:
                flag += f"  LATE by {start - sync:.2f}s"
            if prev_end > window_end + 0.05:
                flag += f"  OVERRUNS by {prev_end - window_end:.2f}s"
            report.append(f"  {block:02d}.{i}  {start:6.2f}-{prev_end:6.2f}s  "
                          f"(slot {sync:.1f}-{window_end:.1f}, speed x{max(tempo, 1):.2f}){flag}")
        # per-block file: no leading silence, trailing silence trimmed
        tmp = OUT / f"vo_{block:02d}_tmp.wav"
        write_wav(tmp, bytes(block_buf))
        ffmpeg("-i", str(tmp), "-af", "areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
               "-ar", "48000", str(OUT / f"vo_{block:02d}.wav"))
        tmp.unlink()

    tmp = OUT / "voiceover_tmp.wav"
    write_wav(tmp, bytes(timeline))
    # loudness-normalise to a standard voice level, 48 kHz
    ffmpeg("-i", str(tmp), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", str(OUT / "voiceover_full.wav"))
    ffmpeg("-i", str(OUT / "voiceover_full.wav"), "-b:a", "192k", str(OUT / "voiceover_full.mp3"))
    tmp.unlink()
    print("\n".join(report))


if __name__ == "__main__":
    if "--assemble" not in sys.argv:
        asyncio.run(generate())
    assemble()
    print(f"\nDone: {OUT / 'voiceover_full.wav'} ({TOTAL:.0f}s, 48 kHz)")
