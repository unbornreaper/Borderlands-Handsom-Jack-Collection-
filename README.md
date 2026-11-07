# WBWHO JACKED

**A simple save editor for Borderlands: The Handsome Jack Collection** (Borderlands 2 + The Pre-Sequel).
It runs in your browser. Nothing gets installed, and your save stays on your device.

![logo](assets/logo.svg)

**▶ Open the editor:** https://unbornreaper.github.io/Borderlands-Handsom-Jack-Collection-/

## How to use it

1. **Back up** your save folder first.
2. Open `index.html` (or the GitHub Pages link, see below).
3. Drop in your `SaveXXXX.sav` (one character) or `profile.bin` (Golden Keys and Badass Rank).
4. Make your changes, then press **Download save**.
5. Put the downloaded file back in the same folder with the same name. Turn off Steam Cloud while you swap files.

**Where your saves are (PC):**
- Borderlands 2: `Documents\My Games\Borderlands 2\WillowGame\SaveData\<numbers>\`
- Pre-Sequel: `Documents\My Games\Borderlands The Pre-Sequel\WillowGame\SaveData\<numbers>\`

## What it can edit

| Tab | What you can do |
|---|---|
| ⚡ Quick Mods | One-tap buttons: max money, max level + OP 10, max skills, gear at your level, max ammo and space, all fast travel, TVHM/UVHM, challenges 1 away from done, or **GOD MODE** (all of them) |
| 👤 Character | Name, level (XP fixed for you), skill points, difficulty modes, OP level, class, save slot |
| 💰 Currency | Cash, Eridium, Seraph Crystals, Torgue Tokens (BL2) / Moonstone (TPS). Eridium over 99 is stored the same way the game stores it |
| 🧠 Skills | Every skill rank, max all, or reset and get the points back |
| 🔫 Backpack & Bank | Search and filter your gear. Tap an item to change its **level, manufacturer and every part**. Duplicate, delete, favorite, move between backpack and bank, copy its code |
| 🛠️ Weapon Forge | Spawn any weapon, shield, grenade, class mod or relic in the game (about 1,600 in BL2 and 1,400 in TPS), then customize it |
| 🧩 Part picker | Every part comes with a plain-English description and tags like `Less recoil`, `+Fire rate`, `+Crit damage`. You can use parts that fit the item, or **parts from any weapon** (modded) |
| ⚡ Make it OP / ☢️ MODDED | One tap on any item. **OP** picks the best legit parts and rarity and sets it to your max level. **MODDED** stacks the strongest parts from any gun into every slot (damage, crit, fire rate) |
| ★ Any slot | Fill empty slots, or put any part in any slot to stack extra bonuses |
| 📊 Stats | Every item shows a power score and bars for damage, crit, fire rate, accuracy, mag, reload and element (or capacity/recharge for gear), with ▲▼ changes as you edit. It's an estimate from the parts, not the in-game damage number |
| 🧱 Stack a stat | Pick Max damage, Crit, Crazy fire rate, No recoil, Fast reload, Huge mag or Element power (one or several). Every free slot gets the strongest part for your picks. The describe box understands it too ("smg with crazy speed and no recoil") |
| 🤖 Describe it | Type what you want ("legendary shock sniper with crazy crit, modded", "conference call", "fast smg that looks like jakobs") and the Forge builds it. Works offline, no AI account needed. 🎲 Re-roll for another match |
| 🎒 Ammo & Space | Ammo SDUs and amounts, backpack and bank size, weapon slots |
| 📜 Missions | Change any mission's status per playthrough, remove a mission so you can replay it, complete them all, add missing ones, or copy Normal mode progress to TVHM/UVHM |
| 🗺️ Fast Travel | Unlock any or all stations, including DLC |
| 👕 Outfits | Any head or skin for your class, plus character colors |
| 🚗 Vehicles | Skins for every vehicle (Runner, Technical, Sandskiff, Fan Boat, Moon Buggy, Stingray) |
| 🏆 Challenges | Set any challenge value, complete all, or set them 1 away from done so you can finish them in-game and earn Badass Rank |
| 🔑 Code Vault | Import and export Gibbed-style `BL2(...)` and `BLOZ(...)` item codes |
| 🗝️ profile.bin | Golden Keys (SHiFT, pre-order, Mechromancer), Badass Rank and tokens, bonus stats, and unlock every head and skin |

You can **undo** any change (button or Ctrl+Z), and the File Info tab lets you download an untouched backup of your original file.

## Supported files

- PC / Steam saves (LZO). This is the main target.
- Decrypted PS3, Vita and Android saves (zlib), raw Switch-style saves, and big-endian PS3/360 saves. The format is detected automatically.
- Decrypted PlayStation saves exported as JSON text (key names like `player_class`, `packed_weapon_data`). They're written back in exactly the same JSON layout.
- PS4 and Xbox One saves are encrypted by the console. Export a decrypted save first with Save Wizard or a similar tool.

## Put it online (GitHub Pages)

In the repo, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then pick this branch and `/ (root)`. The editor will be at `https://<your-username>.github.io/<repo-name>/`.

You can also download the repo and open `index.html` directly. It works offline.

## For developers

```
js/core.js      file formats: SHA-1, CRC-32, LZO1X, Huffman, protobuf, item serials, profile.bin
js/game.js      game knowledge (part lookup, names, rarity) and the SaveModel API
js/partinfo.js  plain-English part descriptions
js/app.js       the UI
data/*.js       game data built from Gibbed's dumps (tools/build-data.js)
tests/          Node tests (set WB_SAMPLES to a folder with sample saves)
```

To rebuild the data:

```
git clone https://github.com/gibbed/Borderlands2Dumps
git clone https://github.com/gibbed/BorderlandsOzDumps
git clone https://github.com/apocalyptech/borderlands2
node tools/build-data.js Borderlands2Dumps BorderlandsOzDumps borderlands2
```

## Credits

The save formats come from community research: [Gibbed's Borderlands 2 / Pre-Sequel tools and data dumps](https://github.com/gibbed), [apocalyptech's CLI editor](https://github.com/apocalyptech/borderlands2), and [B2Profile](https://github.com/withmorten/B2Profile).
This project isn't affiliated with Gearbox or 2K. Mod responsibly, and don't hand god-roll items to strangers in public games.
