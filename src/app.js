const path = require("path");
const express = require("express");
const { createStore } = require("./store");
const { handleApi } = require("./api");

function createApp({ state, persist, today } = {}) {
  const store = createStore(state, today ? { today } : undefined);
  const app = express();

  app.disable("x-powered-by");
  app.use("/api", express.json({ limit: "10kb" }));

  app.use("/api", (req, res) => {
    const result = handleApi(store, {
      method: req.method,
      pathname: req.originalUrl.split("?")[0],
      query: req.query,
      body: req.body,
    });
    if (result.changed && persist) persist(store.snapshot());
    res.set("Cache-Control", "no-store");
    res.status(result.status).json(result.body);
  });

  app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

  // JSON ที่ส่งมาผิดรูปแบบ
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    const status = error.status || error.statusCode || 500;
    res.status(status).json({ message: status === 400 ? "ข้อมูลไม่ถูกต้อง" : "เกิดข้อผิดพลาด" });
  });

  return app;
}

module.exports = { createApp };
