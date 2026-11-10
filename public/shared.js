// ตัวช่วยที่หน้าเคาน์เตอร์และจอเรียกคิวใช้ร่วมกัน
(function () {
  const STATUS = {
    waiting: "รอเรียก",
    called: "กำลังเรียก",
    done: "เสร็จแล้ว",
    skipped: "ข้าม",
  };

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ESC[ch]);
  }

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        ...options,
      });
    } catch {
      throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "ทำรายการไม่สำเร็จ");
    return body;
  }

  const timeFmt = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });
  const dateFmt = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function time(iso) {
    return iso ? timeFmt.format(new Date(iso)) : "";
  }

  function minutesSince(iso, now = Date.now()) {
    return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  }

  function ago(iso) {
    const m = minutesSince(iso);
    if (m < 1) return "เมื่อสักครู่";
    if (m < 60) return `${m} นาทีที่แล้ว`;
    return `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
  }

  function waited(iso) {
    const m = minutesSince(iso);
    if (m < 1) return "เพิ่งมา";
    if (m < 60) return `รอ ${m} นาที`;
    return `รอ ${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
  }

  function formatPhone(tel) {
    if (!tel) return "";
    return tel.length === 10
      ? `${tel.slice(0, 3)}-${tel.slice(3, 6)}-${tel.slice(6)}`
      : `${tel.slice(0, 2)}-${tel.slice(2, 5)}-${tel.slice(5)}`;
  }

  // ป้ายสาธารณะแสดงแค่ชื่อต้นกับอักษรแรกของนามสกุล
  function maskName(name) {
    const parts = String(name || "").trim().split(/\s+/);
    if (parts.length < 2) return parts[0] || "";
    return `${parts[0]} ${Array.from(parts[1])[0]}.`;
  }

  // ให้แท็บอื่นในเบราว์เซอร์เดียวกัน (เช่น จอเรียกคิว) อัปเดตทันที
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("clinic-queue") : null;

  function announceChange() {
    channel?.postMessage({ type: "changed", at: Date.now() });
  }

  function onChange(callback) {
    channel?.addEventListener("message", (event) => {
      if (event.data?.type === "changed") callback();
    });
  }

  // เรียกซ้ำเป็นรอบ หยุดเมื่อแท็บถูกซ่อน และเรียกทันทีเมื่อกลับมา
  function poll(fn, interval) {
    let timer = null;
    let running = false;
    async function tick() {
      clearTimeout(timer);
      if (running) return;
      running = true;
      try {
        await fn();
      } finally {
        running = false;
        if (!document.hidden) timer = setTimeout(tick, interval);
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
      else clearTimeout(timer);
    });
    window.addEventListener("online", tick);
    tick();
    return tick;
  }

  window.Clinic = {
    STATUS,
    esc,
    api,
    time,
    ago,
    waited,
    formatPhone,
    maskName,
    dateFmt,
    announceChange,
    onChange,
    poll,
  };
})();
