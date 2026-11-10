const fs = require("fs");
const path = require("path");
const { createSeed } = require("./store");
const { createApp } = require("./app");

const dataFile = process.env.DATA_FILE || path.join(__dirname, "..", "data", "queue.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return createSeed();
  }
}

function persist(state) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  // เขียนไฟล์ชั่วคราวแล้วค่อยเปลี่ยนชื่อ กันไฟล์เสียถ้าเครื่องดับกลางทาง
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, dataFile);
}

const app = createApp({ state: readState(), persist });
const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`clinic-queue listening on ${port}`);
});
