# Seven Sins & Chess boss sprite set

ชุดนี้สร้างจาก `BOSS_SERIES_DESIGN.md` ด้วย ImageGen ในสไตล์ pixel-art เดียวกับบอสเดิม และแพ็กให้ตรงกับ contract ของ `BossSprite` ปัจจุบัน

## Coverage

### บาป 7 ประการ

- ใช้ของเดิม: `Ragorath` (โทสะ), `Somnivar` (เกียจคร้าน), `Aurelius` (อหังการ เฟส 1)
- เพิ่มใหม่: `Levithar`, `Gulvorax`, `Mammorax`, `Asmodeus`
- เพิ่มเฟส: `AureliusUncrowned` (อหังการ เฟส 2)

### หมากรุก

- เพิ่มใหม่ครบทุกยก: `PawnRank`, `Knight`, `Rook`, `Bishop`, `Queen`, `King`

## Runtime contract

| ไฟล์ | ขนาด | กริด | แถว |
|---|---:|---:|---|
| `public/assets/sprites/bosses/<BossId>.webp` | 1402×1122 | 4×3 | idle, physical/impact, spell/cast |
| `public/assets/sprites/hit/<BossId>.webp` | 2048×512 | 4×1 | hit/recoil |
| `masters/<BossId>.png` | 1408×1408 | 4×4 | ทั้งสี่แถวก่อนแยก runtime |

ทุกเฟรมมีพื้นหลังโปร่งใสและหันไปทางขวา เพราะบอสยืนฝั่งซ้ายของสนาม

## Action-row mapping

ตารางนี้ใช้สำหรับเพิ่ม BossId และ `CAST_MOVES` ในภายหลัง โดยคงกติกาของบอสเดิม: A/B/C ที่เป็น cast ใช้แถว 2; ที่เหลือใช้แถว 1

| Appearance | แถว 1 — physical/impact | แถว 2 — spell/cast |
|---|---|---|
| Levithar | A คลื่นริษยา | B ริบ, C ท่วมท้น |
| Gulvorax | A ตะกละ, B ย่อย | C ขย้อน |
| Mammorax | A เก็บส่วย | B หลอมทอง, C คำสาปมิดาส |
| Asmodeus | A กระซิบ, B จุมพิต | C มนต์เสน่ห์ |
| AureliusUncrowned | A พิพากษาไร้บัลลังก์ | B ราชาที่ไม่ยอมล้ม, C อวสานราชวงศ์ |
| PawnRank | A แทงหอก | B ตั้งแถว, C เลื่อนขั้น |
| Knight | A ตะบันควบ | B กระโดดสองชั้น, C ม้าศึกบ้าคลั่ง |
| Rook | A กระสุนตรง | B กำแพงหิน, C ถล่มป้อม |
| Bishop | A คำสวดเงา | B เปลี่ยนสี, C ทแยงมุมนิรันดร์ |
| Queen | A ราชินีข้ามกระดาน | B บัญชาการ, C รุกฆาตซ้อน |
| King | A ราชองครักษ์ | B ถอยร่น, C ราชโองการสุดท้าย |

## ImageGen prompt set

Shared prompt: create one exact 4×4 production pixel-art sprite sheet; row 1 idle, row 2 physical/impact action, row 3 supernatural/cast action, row 4 hit/recoil; four sequential frames per row; identical identity, costume and proportions in all cells; the complete character remains visible in every action frame; face right; transparent background; no text, grid, scenery or watermark; match the dark high-detail JRPG boss sprites supplied as references.

Boss-specific prompt deltas:

| Appearance | Subject and action direction |
|---|---|
| Levithar | Colossal teal serpentine ice-ocean spirit with spectral fins, chains and mirrors; envious wave; stolen-buff mirror and overwhelming ice tide. |
| Gulvorax | Obese amphibian-insect demon with a belly maw in poison green and violet; swallow/digest impact; poison regurgitation. |
| Mammorax | Treasure-hoard golem built from black-iron coffers, coins and chains; tribute fist smash; molten gold and Midas curse. |
| Asmodeus | Regal, androgynous, non-sexualized demonic monarch with obsidian horn crown, crimson-black armor, cape and violet soul gem; whisper/kiss strike; charm-contract rings. |
| AureliusUncrowned | Existing Aurelius after the crown/halo breaks, with torn purple-white cape and cracked marble armor; ruthless judgment punch; End of Dynasty gold wave. |
| PawnRank | Exactly three obsidian pawn soldiers in spear formation; march and spear thrust; formation and promotion. |
| Knight | Armored spectral chess warhorse fused to a chess base, ivory mane and blue eyes; gallop impact; luminous L-shaped leaps. |
| Rook | Mobile obsidian castle tower with integrated cannon and ram; cannon shot/ram; stone wall and collapsing-line attack. |
| Bishop | Shadow prelate chess piece with diagonal mitre slit, crozier and black/white square motes, without religious symbols; shadow beam; color inversion and diagonal cast. |
| Queen | Slender, non-sexualized obsidian queen with crown, spear and blade-like cape; rook-style rush; pawn summons and double-knight strike. |
| King | Battered ivory king with cracked crown, tower shield and short sword, visually distinct from Queen; adjacent sword/shield sweep; retreat and final-decree repulsion. |

Targeted correction prompt for Levithar: preserve the 4×4 sheet and add the same full, recognizable Levithar into row 3 column 4, partially surrounded by the existing tidal explosion, while leaving the other cells and transparent layout unchanged.
