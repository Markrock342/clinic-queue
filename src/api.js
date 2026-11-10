// เส้นทาง API ที่ไม่ผูกกับเฟรมเวิร์ก ใช้ร่วมกันระหว่าง Express (src/app.js)
// และ Cloudflare Worker (cloudflare/worker.js)
const { SERVICES } = require("./store");

const ACTIONS = {
  call: (store, id) => store.call(id),
  recall: (store, id) => store.recall(id),
  requeue: (store, id) => store.requeue(id),
  done: (store, id) => store.finish(id, "done"),
  skip: (store, id) => store.finish(id, "skipped"),
};

function reply(status, body, changed = false) {
  return { status, body, changed };
}

function route(store, method, pathname, query, body) {
  const path = pathname.replace(/\/+$/, "");

  if (method === "GET") {
    if (path === "/api/health") return reply(200, { ok: true, service: "clinic-queue" });
    if (path === "/api/services") {
      return reply(
        200,
        Object.entries(SERVICES).map(([id, s]) => ({ id, label: s.label, prefix: s.prefix })),
      );
    }
    if (path === "/api/summary") return reply(200, store.summary());
    if (path === "/api/queue") {
      const status = typeof query.status === "string" ? query.status : "";
      return reply(200, { tickets: store.list(status) });
    }
  }

  if (method === "POST") {
    if (path === "/api/queue/reset") {
      store.reset();
      return reply(200, { ok: true }, true);
    }
    if (path === "/api/queue/next") return reply(200, store.callNext(body.service), true);
    if (path === "/api/queue") return reply(201, store.createTicket(body), true);

    const match = path.match(/^\/api\/queue\/([^/]+)\/([a-z]+)$/);
    if (match) {
      const action = ACTIONS[match[2]];
      if (!action) return reply(404, { message: "ไม่พบคำสั่งนี้" });
      return reply(200, action(store, decodeURIComponent(match[1])), true);
    }
  }

  return reply(404, { message: "ไม่พบ API นี้" });
}

// เรียกจากทั้งสองฝั่ง: ล้างคิวเมื่อขึ้นวันใหม่ แล้วตอบคำขอ
function handleApi(store, { method, pathname, query = {}, body = {} }) {
  const rolled = store.rollover();
  try {
    const result = route(store, method.toUpperCase(), pathname, query, body || {});
    return { ...result, changed: result.changed || rolled };
  } catch (error) {
    return reply(error.status || 500, { message: error.status ? error.message : "เกิดข้อผิดพลาด" }, rolled);
  }
}

module.exports = { handleApi };
