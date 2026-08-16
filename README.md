# MoonRage Dungeon — "นาฬิกาแห่งหายนะ" (v0.3.13)

เกมกระดานกึ่งร่วมมือสำหรับ 4 คน ที่แยกออกมาจากโปรเจกต์เดิมให้เป็น **โปรเจกต์เดี่ยวสมบูรณ์ในตัวเอง**
มีแต่โค้ด/เอกสารของกติกา "นาฬิกา 24 ช่อง + ประกาศแอคชันล่วงหน้า" เท่านั้น (ตัดเวอร์ชันเก่า 0.1.0/0.2.0
และเมนู "รายการเวอร์ชันเดิม" ออกทั้งหมด) พร้อมนำไปสร้างเป็น GitHub repo ใหม่ได้ทันที

**เริ่มอ่านที่นี่ก่อนแตะโค้ด:**
1. [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — กติกาต้นฉบับทั้งหมด (ตัวละคร บอส สกิล คะแนน)
2. [`docs/RULINGS.md`](docs/RULINGS.md) — คำตัดสินที่เอกสารไม่ได้ระบุตรงๆ + ประวัติการแก้กติกาภายหลัง
   (จำเป็นมาก ถ้าไม่รู้จะงงว่าทำไมโค้ดบางจุดไม่ตรงกับ GAME_DESIGN.md ตรงตัว)
3. [`docs/BALANCE_NOTES.md`](docs/BALANCE_NOTES.md) — ผลจำลองสมดุลจริงจาก `tools/balance.ts`

## Stack

React 18 + TypeScript + Vite + Tailwind + Zustand. ไม่มี backend/database — เกมรันฝั่ง client ล้วน
เอนจิ้นเป็น pure TypeScript generator (`function*`) ที่ yield การตัดสินใจแล้ว resume ด้วย `.next(choice)`,
มี seeded RNG ทำให้ทุกเกม reproduce ได้ 100% ดูโครงสร้างเต็มที่ [`src/engine/clock/`](src/engine/clock)

## รันเกม

```bash
npm install
npm run dev        # http://localhost:5173 — แก้โค้ดแล้วรีเฟรชสด
```

```bash
npm test                  # เทสทั้งหมด — clock walk/stacking, สกิล 12 ใบ (โครง ①②③ ต่อตัวละคร), บอส 3 ตัว, คะแนน/EXP, full-game smoke
npm run typecheck         # tsc --noEmit
npm run build             # production build → dist/
npm run balance -- 2000   # จำลองสมดุลด้วยบอทกลาง 4 ตัว 2000 เกม — ผลจริงบันทึกไว้ใน docs/BALANCE_NOTES.md
```

## รันด้วย Docker

```bash
docker compose up -d --build
# เปิด http://localhost:8080
docker compose down
```

`Dockerfile` เป็น multi-stage build (Node build → nginx serve static ตาม `nginx.conf`)

## Deploy

โปรเจกต์นี้ deploy ขึ้น Vercel ได้ตรงๆ ไม่ต้องตั้งค่าเพิ่ม (`npm run build` → serve โฟลเดอร์ `dist/` แบบ
static SPA) หรือจะใช้ Docker image ด้านบนไปรันที่ไหนก็ได้ก็ได้เหมือนกัน

## โครงสร้างโปรเจกต์

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `src/engine/clock/` | เอนจิ้นกติกาล้วน (ไม่มี UI ปน) — walk loop, สกิล declare/resolve, บอส AI, คะแนน |
| `src/bots/` | บอท 3 ระดับ (easy/medium/hard) ใช้เล่นแทนผู้เล่นหรือรันจำลองสมดุล |
| `src/content/` | ข้อมูลดิบ: ตัวละคร/สกิล/บอส/ข้อความ i18n (ไทย/อังกฤษ) |
| `src/session/` | ชั้นเชื่อมเอนจิ้นกับ UI — GameSession, playback/pacing, persistence (localStorage) |
| `src/ui/` | หน้าจอและคอมโพเนนต์ React ทั้งหมด |
| `tests/` | Vitest — ครอบคลุมกติกาทุกจุดที่มีคำตัดสินใน `docs/RULINGS.md` |
| `tools/balance.ts` | ตัวจำลองบอทเล่นกันเอง 4 คน ใช้วัดสมดุลก่อน/หลังแก้ค่าใดๆ ใน `src/content/` |
| `public/assets/` | ภาพตัวละคร/บอส/ฉากที่ใช้จริงใน v0.3.0 เท่านั้น |

## แก้กติกา/สมดุล

ตัวเลขเกมทั้งหมด (ดาเมจ ⏱ HP เกราะ ฯลฯ) อยู่ใน `src/content/characters.ts` และ `src/content/bosses3.ts`
ล้วนๆ ไม่ปนกับ logic แก้ค่าตรงนั้นแล้วรัน `npm run balance -- 2000` เทียบผลกับตัวเลขที่บันทึกไว้ใน
`docs/BALANCE_NOTES.md` ก่อน/หลังเสมอ แล้วอัปเดตทั้งสามที่ (โค้ด, เทส, BALANCE_NOTES.md) ให้ตรงกัน
