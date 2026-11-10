# ระบบคิวคลินิกบ้านใบเตย

Mini-Project: จำลองระบบคิวหน้าเคาน์เตอร์ของคลินิก ให้รันได้จริง แล้วทำ CI/CD ด้วย GitHub + Jenkins

**ใช้งานจริงบน Cloudflare:** https://clinic-queue.demo-agent-jum.workers.dev
(จอผู้ป่วย: https://clinic-queue.demo-agent-jum.workers.dev/display)

ฟังก์ชันที่ทำให้ใช้ได้

- รับบัตรคิว 3 แผนก: ตรวจทั่วไป (A), ทันตกรรม (D), ห้องแล็บ (L) พร้อมพิมพ์บัตรคิว 80 มม.
- หน้าเคาน์เตอร์เห็นทั้ง 3 แผนกพร้อมกัน เรียกคนถัดไป หรือ "เสร็จ แล้วเรียกคนถัดไป" ในคลิกเดียว
- ปิดคิว ข้าม เรียกซ้ำ และนำคิวที่ข้ามกลับเข้าคิวรอ
- ค้นหาด้วยชื่อ เลขคิว หรือเบอร์โทร กรองตามสถานะและแผนก
- จอเรียกคิวสำหรับผู้ป่วย (`/display`) มีเสียงกริ่งและเสียงประกาศภาษาไทย
- หลายเครื่องใช้พร้อมกันได้ ซิงก์อัตโนมัติทุก 2–3 วินาที
- ขึ้นวันใหม่ (เวลาไทย) ระบบล้างคิวและเริ่มเลข 001 ให้เอง
- บันทึกคิวลงไฟล์ JSON รีสตาร์ทแล้วข้อมูลยังอยู่
- โหมดสว่าง/มืด และใช้บนมือถือได้

ยังไม่ทำในรอบนี้: ล็อกอิน, นัดหมาย, เวชระเบียน, การเงิน, แจ้งเตือนมือถือ

## รันบนเครื่อง

ต้องมี Node.js 20 ขึ้นไป

```bash
npm ci
npm test
npm start
```

- หน้าเคาน์เตอร์: http://localhost:3000
- จอเรียกคิว: http://localhost:3000/display (กด "เปิดเสียงและเต็มจอ" หนึ่งครั้งเพื่อให้เบราว์เซอร์เล่นเสียงได้)

ครั้งแรกที่ยังไม่มีไฟล์ข้อมูล ระบบใส่คิวตัวอย่างให้ 4 รายการ เพื่อใช้เดโมได้ทันที

### API

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/summary` | สรุปทั้งวัน แยกแผนก คิวถัดไป และคิวที่เรียกล่าสุด |
| GET | `/api/queue?status=` | รายการคิว |
| POST | `/api/queue` | ออกบัตร `{ patientName, phone, service }` |
| POST | `/api/queue/next` | เรียกคนถัดไป `{ service }` (ไม่ใส่ = ทุกแผนก) |
| POST | `/api/queue/:id/call` | เรียกคิวนี้ |
| POST | `/api/queue/:id/recall` | เรียกซ้ำ |
| POST | `/api/queue/:id/done` | เสร็จแล้ว |
| POST | `/api/queue/:id/skip` | ข้าม |
| POST | `/api/queue/:id/requeue` | นำคิวที่ข้ามกลับเข้าคิวรอ |
| POST | `/api/queue/reset` | ล้างคิววันนี้ |

## Docker

```bash
docker compose up -d --build
```

## Cloudflare Workers

เวอร์ชันออนไลน์รันบน Cloudflare Workers

- หน้าเว็บในโฟลเดอร์ `public/` เสิร์ฟเป็น Static Assets
- `/api/*` วิ่งเข้า `cloudflare/worker.js` แล้วส่งต่อให้ **Durable Object** ตัวเดียว (`QueueStore`) เก็บคิวใน SQLite ของ Durable Object ทุกเคาน์เตอร์และจอผู้ป่วยจึงเห็นข้อมูลชุดเดียวกัน
- ตรรกะ API อยู่ที่ `src/api.js` ใช้ร่วมกันทั้ง Express และ Worker ผลเทสจึงครอบคลุมทั้งสองแบบ

```bash
npm run cf:dev      # รัน Worker บนเครื่องที่ http://localhost:8787
npm run cf:deploy   # deploy ขึ้น Cloudflare (ต้อง npx wrangler login ก่อน)
```

## CI/CD

โค้ดอยู่บน GitHub คนในกลุ่ม clone แล้วส่งงานเข้า branch เดียวกัน

Jenkins ใช้ `Jenkinsfile` สาม stage

1. **Build** — `npm ci`
2. **Test** — `npm test`
3. **Deploy** — `scripts/deploy.sh` สร้าง image แล้วรันที่พอร์ต 3000

ถ้าเครื่อง Jenkins มี Docker จะ deploy ด้วย Docker ถ้าไม่มี จะลงที่ `$HOME/clinic-queue-deploy` แล้วรันด้วย Node

### เปิด Jenkins บนเครื่องด้วยคำสั่งเดียว

ต้องมี Java 21 และ Node.js 20+ (ไม่ต้องใช้ Docker)

```bash
./jenkins/start.sh
```

สคริปต์ดาวน์โหลด Jenkins LTS กับปลั๊กอิน (Git, Pipeline, Stage View) แล้วสร้าง job `clinic-queue`
ที่ดึง `Jenkinsfile` จาก GitHub ให้เอง เปิด http://localhost:8080/job/clinic-queue/ แล้วกด **Build Now**
job เช็กโค้ดใหม่บน GitHub ทุก 2 นาที push แล้ว Jenkins จะ build เอง

Jenkins นี้ไม่มีล็อกอินและเปิดให้เข้าได้เฉพาะจากเครื่องตัวเอง (127.0.0.1) ใช้สำหรับเดโมเท่านั้น

### ตั้ง Jenkins เอง (เครื่องอื่น)

1. ติดตั้ง Jenkins แล้วติดตั้งปลั๊กอิน **Git** และ **Pipeline**
2. ติดตั้ง Node.js 20 บนเครื่อง Jenkins แล้วให้คำสั่ง `node` / `npm` อยู่ใน PATH
3. New Item → Pipeline → เลือก **Pipeline script from SCM**
4. SCM เป็น Git ใส่ URL ของ repo นี้, branch `main`, Script Path = `Jenkinsfile`
5. Build Now แล้วแคปหน้า Stage View ที่ Build, Test, Deploy เป็นสีเขียว

## ส่งงาน

- ลิงก์ GitHub ของ repo นี้
- ภาพหน้าจอ Jenkins ที่ pipeline ผ่าน
- ไฟล์นำเสนอ `presentation/mini-project-clinic-queue.pptx`

แก้ชื่อสมาชิกกลุ่มที่สไลด์แรกก่อนนำเสนอ
