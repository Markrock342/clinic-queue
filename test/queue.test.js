const request = require("supertest");
const { createApp } = require("../src/app");

function app() {
  return createApp({ state: { seq: {}, tickets: [] } });
}

describe("ระบบคิวคลินิก", () => {
  test("ออกบัตรคิวแยกเลขตามแผนก", async () => {
    const api = app();

    const first = await request(api).post("/api/queue").send({
      patientName: "สมชาย ใจดี",
      phone: "0812345678",
      service: "general",
    });
    const second = await request(api).post("/api/queue").send({
      patientName: "มานี ศรีสุข",
      phone: "",
      service: "dental",
    });
    const third = await request(api).post("/api/queue").send({
      patientName: "วิชัย บุญมา",
      service: "general",
    });

    expect(first.status).toBe(201);
    expect(first.body.number).toBe("A001");
    expect(second.body.number).toBe("D001");
    expect(third.body.number).toBe("A002");
    expect(first.body.status).toBe("waiting");
  });

  test("ไม่รับชื่อว่าง เบอร์ผิด หรือแผนกที่ไม่มี", async () => {
    const api = app();

    const empty = await request(api).post("/api/queue").send({ patientName: "  ", service: "general" });
    const phone = await request(api).post("/api/queue").send({
      patientName: "สมชาย",
      phone: "1234",
      service: "general",
    });
    const service = await request(api).post("/api/queue").send({ patientName: "สมชาย", service: "xray" });

    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe("กรอกชื่อผู้ป่วย");
    expect(phone.body.message).toBe("เบอร์โทรไม่ถูกต้อง");
    expect(service.body.message).toBe("เลือกแผนก");
  });

  test("เรียกคิวที่รอนานสุดก่อน แล้วปิดคิวได้", async () => {
    const api = app();
    await request(api).post("/api/queue").send({ patientName: "คนแรก", service: "lab" });
    await request(api).post("/api/queue").send({ patientName: "คนถัดไป", service: "lab" });

    const called = await request(api).post("/api/queue/next").send({ service: "lab" });
    expect(called.body.number).toBe("L001");
    expect(called.body.status).toBe("called");

    const summary = await request(api).get("/api/summary");
    expect(summary.body.waiting).toBe(1);
    expect(summary.body.current.patientName).toBe("คนแรก");

    const done = await request(api).post(`/api/queue/${called.body.id}/done`);
    expect(done.body.status).toBe("done");

    const again = await request(api).post(`/api/queue/${called.body.id}/done`);
    expect(again.status).toBe(409);
  });

  test("ข้ามคิวได้เฉพาะคิวที่เรียกแล้ว และไม่มีคิวรอแล้วต้องแจ้ง", async () => {
    const api = app();
    const created = await request(api).post("/api/queue").send({ patientName: "ประภา", service: "dental" });

    const tooSoon = await request(api).post(`/api/queue/${created.body.id}/skip`);
    expect(tooSoon.status).toBe(409);

    await request(api).post(`/api/queue/${created.body.id}/call`);
    const skipped = await request(api).post(`/api/queue/${created.body.id}/skip`);
    expect(skipped.body.status).toBe("skipped");

    const empty = await request(api).post("/api/queue/next").send({});
    expect(empty.status).toBe(404);
    expect(empty.body.message).toBe("ไม่มีคิวที่รอ");
  });

  test("ป้ายกำลังเรียกแสดงคิวที่เพิ่งเรียก", async () => {
    const api = app();
    const first = await request(api).post("/api/queue").send({ patientName: "เอ", service: "general" });
    const second = await request(api).post("/api/queue").send({ patientName: "บี", service: "dental" });

    await request(api).post(`/api/queue/${second.body.id}/call`);
    await request(api).post(`/api/queue/${first.body.id}/call`);

    const summary = await request(api).get("/api/summary");
    expect(summary.body.current.number).toBe("A001");
    expect(summary.body.called).toBe(2);
  });

  test("สุขภาพบริการตอบกลับได้", async () => {
    const response = await request(app()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe("ฟีเจอร์หน้าเคาน์เตอร์และจอเรียกคิว", () => {
  test("สรุปแยกตามแผนก พร้อมคิวถัดไปและคิวที่เรียกล่าสุด", async () => {
    const api = app();
    await request(api).post("/api/queue").send({ patientName: "หนึ่ง", service: "general" });
    await request(api).post("/api/queue").send({ patientName: "สอง", service: "general" });
    await request(api).post("/api/queue").send({ patientName: "สาม", service: "dental" });
    await request(api).post("/api/queue/next").send({ service: "general" });

    const { body } = await request(api).get("/api/summary");
    const general = body.services.find((service) => service.id === "general");
    const dental = body.services.find((service) => service.id === "dental");

    expect(body.services).toHaveLength(3);
    expect(general.current.number).toBe("A001");
    expect(general.waiting).toBe(1);
    expect(general.next.map((ticket) => ticket.number)).toEqual(["A002"]);
    expect(dental.current).toBeNull();
    expect(dental.next[0].number).toBe("D001");
    expect(body.recent.map((ticket) => ticket.number)).toEqual(["A001"]);
  });

  test("เรียกซ้ำได้เฉพาะคิวที่กำลังเรียก และนับจำนวนครั้ง", async () => {
    const api = app();
    const created = await request(api).post("/api/queue").send({ patientName: "เอ", service: "lab" });

    const early = await request(api).post(`/api/queue/${created.body.id}/recall`);
    expect(early.status).toBe(409);

    const called = await request(api).post(`/api/queue/${created.body.id}/call`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const recalled = await request(api).post(`/api/queue/${created.body.id}/recall`);

    expect(recalled.status).toBe(200);
    expect(recalled.body.recalls).toBe(1);
    expect(recalled.body.calledAt > called.body.calledAt).toBe(true);
  });

  test("คิวที่ข้ามนำกลับเข้าคิวรอได้", async () => {
    const api = app();
    const created = await request(api).post("/api/queue").send({ patientName: "บี", service: "dental" });

    const notSkipped = await request(api).post(`/api/queue/${created.body.id}/requeue`);
    expect(notSkipped.status).toBe(409);

    await request(api).post(`/api/queue/${created.body.id}/call`);
    await request(api).post(`/api/queue/${created.body.id}/skip`);
    const back = await request(api).post(`/api/queue/${created.body.id}/requeue`);

    expect(back.body.status).toBe("waiting");
    expect(back.body.calledAt).toBeNull();
    const next = await request(api).post("/api/queue/next").send({});
    expect(next.body.number).toBe("D001");
  });

  test("ขึ้นวันใหม่แล้วล้างคิวและเริ่มเลขใหม่", async () => {
    let day = "2026-11-10";
    const api = createApp({ state: { seq: {}, tickets: [] }, today: () => day });
    await request(api).post("/api/queue").send({ patientName: "เมื่อวาน", service: "general" });

    day = "2026-11-11";
    const summary = await request(api).get("/api/summary");
    expect(summary.body.total).toBe(0);
    expect(summary.body.day).toBe("2026-11-11");

    const fresh = await request(api).post("/api/queue").send({ patientName: "วันนี้", service: "general" });
    expect(fresh.body.number).toBe("A001");
  });

  test("ตัดช่องว่างและขีดในเบอร์โทร", async () => {
    const response = await request(app()).post("/api/queue").send({
      patientName: "  สมหญิง   ดีใจ ",
      phone: "081-234-5678",
      service: "general",
    });
    expect(response.body.patientName).toBe("สมหญิง ดีใจ");
    expect(response.body.phone).toBe("0812345678");
  });

  test("คำสั่งหรือ JSON ที่ไม่ถูกต้องตอบเป็น JSON", async () => {
    const api = app();
    const unknown = await request(api).post("/api/queue/general-1/explode");
    expect(unknown.status).toBe(404);

    const broken = await request(api)
      .post("/api/queue")
      .set("Content-Type", "application/json")
      .send("{oops");
    expect(broken.status).toBe(400);
    expect(broken.body.message).toBe("ข้อมูลไม่ถูกต้อง");
  });

  test("หน้าเคาน์เตอร์และจอเรียกคิวเปิดได้", async () => {
    const api = app();
    const home = await request(api).get("/");
    const display = await request(api).get("/display");
    expect(home.status).toBe(200);
    expect(display.status).toBe(200);
    expect(display.text).toContain("display.js");
  });
});
