// Cloudflare Worker: หน้าเว็บมาจาก Static Assets (โฟลเดอร์ public/)
// ส่วน /api/* ส่งต่อให้ Durable Object ตัวเดียว เพื่อให้ทุกเคาน์เตอร์เห็นคิวชุดเดียวกัน
import { DurableObject } from "cloudflare:workers";
import storeModule from "../src/store.js";
import apiModule from "../src/api.js";

const { createStore, createSeed } = storeModule;
const { handleApi } = apiModule;

const STATE_KEY = "state";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export class QueueStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    const row = this.sql.exec("SELECT v FROM kv WHERE k = ?", STATE_KEY).toArray()[0];
    const initial = row ? JSON.parse(row.v) : createSeed();
    this.store = createStore(initial);
    if (!row) this.save();
  }

  save() {
    this.sql.exec(
      "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      STATE_KEY,
      JSON.stringify(this.store.snapshot()),
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    let body = {};
    if (request.method === "POST") {
      const text = await request.text();
      if (text.length > 10_000) return json(413, { message: "ข้อมูลใหญ่เกินไป" });
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return json(400, { message: "ข้อมูลไม่ถูกต้อง" });
        }
      }
    }

    const result = handleApi(this.store, {
      method: request.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
    });
    if (result.changed) this.save();
    return json(result.status, result.body);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const stub = env.QUEUE.get(env.QUEUE.idFromName("clinic"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
