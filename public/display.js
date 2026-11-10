const { esc, api, maskName, time, onChange, poll } = window.Clinic;

const $ = (selector) => document.querySelector(selector);

const el = {
  time: $("#d-time"),
  calls: $("#calls"),
  lanes: $("#lanes"),
  offline: $("#offline"),
  gate: $("#gate"),
  sound: $("#sound-toggle"),
};

let soundOn = false;
let audio = null;
let lastSeen = null; // calledAt ล่าสุดที่ประกาศไปแล้ว
let rendered = { calls: "", lanes: "" };

/* ---------- นาฬิกา ---------- */

function tickClock() {
  el.time.textContent = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}
tickClock();
setInterval(tickClock, 10_000);

/* ---------- เสียง ---------- */

const LETTERS = { A: "เอ", D: "ดี", L: "แอล" };
const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

function spokenNumber(number) {
  return [...number].map((ch) => LETTERS[ch] || DIGITS[Number(ch)] || ch).join(" ");
}

function chime() {
  if (!audio) return Promise.resolve();
  const start = audio.currentTime + 0.05;
  [659.25, 523.25].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + i * 0.55;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 1.2);
  });
  return new Promise((resolve) => setTimeout(resolve, 1300));
}

function speak(text) {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "th-TH";
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("th"));
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.onend = resolve;
    utter.onerror = resolve;
    speechSynthesis.speak(utter);
    setTimeout(resolve, 9000); // กันค้างถ้าเบราว์เซอร์ไม่ยิง onend
  });
}

let announcing = Promise.resolve();

function announce(ticket) {
  announcing = announcing.then(async () => {
    flash();
    if (!soundOn) return;
    await chime();
    await speak(`ขอเชิญหมายเลข ${spokenNumber(ticket.number)} ที่ ${ticket.serviceLabel} ค่ะ`);
  });
}

function setSound(on) {
  soundOn = on;
  el.sound.setAttribute("aria-pressed", String(on));
  el.sound.textContent = on ? "เสียง: เปิด" : "เสียง: ปิด";
  if (on && !audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audio = new Ctx();
  }
  audio?.resume?.();
  if (!on && "speechSynthesis" in window) speechSynthesis.cancel();
}

el.sound.addEventListener("click", () => setSound(!soundOn));

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
}

$("#fullscreen").addEventListener("click", toggleFullscreen);

$("#gate-sound").addEventListener("click", () => {
  setSound(true);
  el.gate.hidden = true;
  toggleFullscreen();
  if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
});

$("#gate-silent").addEventListener("click", () => {
  setSound(false);
  el.gate.hidden = true;
});

/* ซ่อนปุ่มเมื่อไม่ขยับเมาส์ */
let idleTimer;
function wake() {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 4000);
}
["mousemove", "keydown", "touchstart"].forEach((type) => document.addEventListener(type, wake, { passive: true }));
wake();

/* ---------- วาดจอ ---------- */

function flash() {
  const row = el.calls.querySelector(".is-current");
  if (!row) return;
  row.classList.remove("flash");
  void row.offsetWidth;
  row.classList.add("flash");
}

function callRow(ticket, current) {
  return `<li class="call ${current ? "is-current" : ticket.status === "called" ? "" : "is-past"}">
    <span class="call-num">${esc(ticket.number)}</span>
    <span class="call-where">
      <span class="call-label">ขอเชิญหมายเลข</span>
      <b>${esc(ticket.serviceLabel)}</b>
      <small>คุณ${esc(maskName(ticket.patientName))}</small>
    </span>
    <span class="call-time">${time(ticket.calledAt)}</span>
  </li>`;
}

function callsHTML(summary) {
  const { current, recent } = summary;
  const rest = recent.filter((t) => t.id !== current?.id).slice(0, current ? 4 : 5);
  const head = current
    ? callRow(current, true)
    : `<li class="call is-waiting"><span class="call-num">—</span><span class="call-where"><b>ยังไม่มีการเรียกคิว</b><small>กรุณานั่งรอสักครู่</small></span><span></span></li>`;
  return head + rest.map((t) => callRow(t, false)).join("");
}

function lanesHTML(services) {
  return services
    .map(
      (s) => `<div class="lane">
        <p class="lane-head"><span class="bullet">${s.prefix}</span>${esc(s.label)}<small>รอ ${s.waiting} คิว</small></p>
        <p class="lane-nums">${
          s.next.length ? s.next.map((t) => `<b>${esc(t.number)}</b>`).join("") : `<span class="none">ไม่มีคิวรอ</span>`
        }</p>
      </div>`,
    )
    .join("");
}

function render(summary) {
  const calls = callsHTML(summary);
  if (calls !== rendered.calls) {
    el.calls.innerHTML = calls;
    rendered.calls = calls;
  }
  const lanes = lanesHTML(summary.services);
  if (lanes !== rendered.lanes) {
    el.lanes.innerHTML = lanes;
    rendered.lanes = lanes;
  }
}

async function refresh() {
  try {
    const summary = await api("/api/summary");
    render(summary);
    el.offline.hidden = true;

    const latest = summary.recent[0]?.calledAt || "";
    if (lastSeen === null) {
      lastSeen = latest; // เปิดจอครั้งแรก ไม่ประกาศของเก่า
      return;
    }
    const fresh = summary.recent
      .filter((t) => t.status === "called" && t.calledAt > lastSeen)
      .sort((a, b) => a.calledAt.localeCompare(b.calledAt));
    lastSeen = latest > lastSeen ? latest : latest || "";
    fresh.forEach(announce);
  } catch {
    el.offline.hidden = false;
  }
}

const refreshNow = poll(refresh, 2000);
onChange(refreshNow);
