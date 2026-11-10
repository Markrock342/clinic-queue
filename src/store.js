const SERVICES = {
  general: { label: "ตรวจทั่วไป", prefix: "A" },
  dental: { label: "ทันตกรรม", prefix: "D" },
  lab: { label: "ห้องแล็บ", prefix: "L" },
};

// Cloudflare Workers ไม่มี process จึงต้องเช็กก่อน
const TIME_ZONE =
  (typeof process !== "undefined" && process.env && process.env.CLINIC_TZ) || "Asia/Bangkok";

function bangkokDay(date = new Date()) {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createStore(initial = {}, { today = bangkokDay } = {}) {
  const seq = {
    general: 0,
    dental: 0,
    lab: 0,
    ...(initial.seq || {}),
  };
  const tickets = Array.isArray(initial.tickets)
    ? initial.tickets.map((ticket) => ({ recalls: 0, ...ticket }))
    : [];
  let day = initial.day || null;

  const copy = (ticket) => ({ ...ticket });

  function snapshot() {
    return {
      day,
      seq: { ...seq },
      tickets: tickets.map(copy),
    };
  }

  function createTicket({ patientName, phone, service }) {
    const name = String(patientName ?? "").trim().replace(/\s+/g, " ");
    const tel = String(phone ?? "").replace(/[\s-]/g, "");

    if (!name) throw fail("กรอกชื่อผู้ป่วย", 400);
    if (name.length > 80) throw fail("ชื่อยาวเกินไป", 400);
    if (tel && !/^0\d{8,9}$/.test(tel)) throw fail("เบอร์โทรไม่ถูกต้อง", 400);

    const department = SERVICES[service];
    if (!department) throw fail("เลือกแผนก", 400);

    seq[service] += 1;
    const ticket = {
      id: `${service}-${seq[service]}`,
      number: `${department.prefix}${String(seq[service]).padStart(3, "0")}`,
      patientName: name,
      phone: tel,
      service,
      serviceLabel: department.label,
      status: "waiting",
      createdAt: new Date().toISOString(),
      calledAt: null,
      finishedAt: null,
      recalls: 0,
    };
    tickets.push(ticket);
    return copy(ticket);
  }

  function list(status) {
    return tickets.filter((ticket) => !status || ticket.status === status).map(copy);
  }

  function find(id) {
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket) throw fail("ไม่พบคิวนี้", 404);
    return ticket;
  }

  function call(id) {
    const ticket = find(id);
    if (ticket.status !== "waiting") throw fail("คิวนี้ถูกเรียกไปแล้ว", 409);
    ticket.status = "called";
    ticket.calledAt = new Date().toISOString();
    return copy(ticket);
  }

  function callNext(service) {
    if (service && !SERVICES[service]) throw fail("เลือกแผนก", 400);
    const ticket = tickets.find(
      (item) => item.status === "waiting" && (!service || item.service === service),
    );
    if (!ticket) throw fail("ไม่มีคิวที่รอ", 404);
    return call(ticket.id);
  }

  function recall(id) {
    const ticket = find(id);
    if (ticket.status !== "called") throw fail("เรียกซ้ำได้เฉพาะคิวที่กำลังเรียก", 409);
    ticket.calledAt = new Date().toISOString();
    ticket.recalls = (ticket.recalls || 0) + 1;
    return copy(ticket);
  }

  function requeue(id) {
    const ticket = find(id);
    if (ticket.status !== "skipped") throw fail("นำกลับเข้าคิวได้เฉพาะคิวที่ข้าม", 409);
    ticket.status = "waiting";
    ticket.calledAt = null;
    ticket.finishedAt = null;
    return copy(ticket);
  }

  function finish(id, status) {
    const ticket = find(id);
    if (ticket.status !== "called") throw fail("เรียกคิวก่อน", 409);
    ticket.status = status;
    ticket.finishedAt = new Date().toISOString();
    return copy(ticket);
  }

  const byCalledDesc = (a, b) => String(b.calledAt).localeCompare(String(a.calledAt));

  function summary() {
    const count = (status) => tickets.filter((ticket) => ticket.status === status).length;
    const called = tickets.filter((ticket) => ticket.status === "called").sort(byCalledDesc);

    const services = Object.entries(SERVICES).map(([id, service]) => {
      const mine = tickets.filter((ticket) => ticket.service === id);
      const waiting = mine.filter((ticket) => ticket.status === "waiting");
      const active = called.filter((ticket) => ticket.service === id);
      return {
        id,
        label: service.label,
        prefix: service.prefix,
        waiting: waiting.length,
        called: active.length,
        done: mine.filter((ticket) => ticket.status === "done").length,
        current: active[0] ? copy(active[0]) : null,
        next: waiting.slice(0, 3).map(copy),
      };
    });

    const recent = tickets
      .filter((ticket) => ticket.calledAt)
      .sort(byCalledDesc)
      .slice(0, 8)
      .map(copy);

    return {
      day,
      waiting: count("waiting"),
      called: count("called"),
      done: count("done"),
      skipped: count("skipped"),
      total: tickets.length,
      current: called[0] ? copy(called[0]) : null,
      services,
      recent,
    };
  }

  function reset() {
    tickets.splice(0, tickets.length);
    seq.general = 0;
    seq.dental = 0;
    seq.lab = 0;
  }

  // คืน true เมื่อสถานะเปลี่ยนและควรบันทึก
  function rollover() {
    const now = today();
    if (day === now) return false;
    if (day) reset();
    day = now;
    return true;
  }

  return {
    createTicket,
    list,
    call,
    callNext,
    recall,
    requeue,
    finish,
    summary,
    snapshot,
    reset,
    rollover,
  };
}

function createSeed(now = Date.now()) {
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const base = { phone: "", calledAt: null, finishedAt: null, recalls: 0 };
  return {
    day: bangkokDay(new Date(now)),
    seq: { general: 2, dental: 1, lab: 1 },
    tickets: [
      {
        ...base,
        id: "lab-1",
        number: "L001",
        patientName: "ประภา ทองคำ",
        service: "lab",
        serviceLabel: "ห้องแล็บ",
        status: "called",
        createdAt: ago(24),
        calledAt: ago(6),
      },
      {
        ...base,
        id: "general-1",
        number: "A001",
        patientName: "สมชาย ใจดี",
        phone: "0810000001",
        service: "general",
        serviceLabel: "ตรวจทั่วไป",
        status: "waiting",
        createdAt: ago(18),
      },
      {
        ...base,
        id: "dental-1",
        number: "D001",
        patientName: "มานี ศรีสุข",
        phone: "0890000002",
        service: "dental",
        serviceLabel: "ทันตกรรม",
        status: "waiting",
        createdAt: ago(11),
      },
      {
        ...base,
        id: "general-2",
        number: "A002",
        patientName: "วิชัย บุญมา",
        phone: "0820000004",
        service: "general",
        serviceLabel: "ตรวจทั่วไป",
        status: "waiting",
        createdAt: ago(5),
      },
    ],
  };
}

module.exports = { SERVICES, createSeed, createStore, bangkokDay };
