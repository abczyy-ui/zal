/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         🎮 WHATSAPP GAME BOT - BY FUN BOT 🎮         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * INSTALL (Termux):
 *   pkg install ffmpeg
 *   npm install @whiskeysockets/baileys pino axios node-webpmux
 * RUN    : node index.js
 *
 * CATATAN: versi ini TIDAK memakai "sharp" / "wa-sticker-formatter"
 * (gagal di-build di Termux/Android arm64). Pembuatan sticker sekarang
 * memakai ffmpeg (binary sistem, dipasang lewat "pkg install ffmpeg")
 * untuk convert gambar/video ke webp, lalu "node-webpmux" (pure JS,
 * tanpa native build) untuk menulis metadata sticker-pack-name &
 * publisher ke EXIF webp.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const pino     = require("pino");
const readline = require("readline");
const os       = require("os");
const axios    = require("axios");
const fs       = require("fs");
const path     = require("path");
const { spawn } = require("child_process");
const WebP     = require("node-webpmux");

// ─── GLOBAL CONFIG ────────────────────────────────────────────────────────────
global.namabot       = "𝕽𝖎𝖏𝖆𝖑 𝕸𝖚𝖑𝖙𝖎 𝕯𝖊𝖛𝖎𝖈𝖊💫✨";
global.ownernumber   = "6283171413750";   // ← Ganti nomor owner
global.ownerLid      = "155418206691577"; // ← LID owner (lihat dari .myid kalau WA pakai sistem LID)
global.ownername     = "rijall💫";           // ← Ganti nama owner
global.botMode       = true;              // true = Public, false = Self
global.prefix        = ".";
global.version       = "5.0.0";
global.sessionDir    = "./session";
global.menuImage     = "https://files.catbox.moe/sehx6r.jpeg";
global.stickerAuthor = "punya rijal wlee😝"; // ← Author/credit yang muncul di sticker
global.stickerPack   = global.namabot;
global.saldoAwal     = 100000;             // ← Saldo awal user baru
global.slotWinRate   = 0.38;               // ← Persentase menang slot (0.38 = 38%)

// ─── RUNTIME HELPER ──────────────────────────────────────────────────────────
function runtime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}h ${h}j ${m}m ${s}d`;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────────
const gameState = {};
function getState(jid) {
  if (!gameState[jid]) gameState[jid] = {};
  return gameState[jid];
}

// ─── DATABASE USER (IN-MEMORY) ─────────────────────────────────────────────────
// Menyimpan saldo & data user selama bot berjalan. Data ini akan hilang
// kalau bot di-restart (sesuai permintaan: tidak disimpan ke file/disk).
global.db = { data: { users: {} } };

function getUser(jid) {
  if (!global.db.data.users[jid]) {
    global.db.data.users[jid] = {
      money: global.saldoAwal,
    };
  }
  return global.db.data.users[jid];
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

// ═════════════════════════════════════════════════════════
//  DATA GAME
// ═════════════════════════════════════════════════════════

const BENDERA_DATA = [
  { emoji: "🇮🇩", jawaban: ["indonesia"], hint: "Negara kepulauan terbesar" },
  { emoji: "🇯🇵", jawaban: ["jepang", "japan"], hint: "Negeri Sakura" },
  { emoji: "🇺🇸", jawaban: ["amerika", "usa", "united states"], hint: "Negeri Paman Sam" },
  { emoji: "🇧🇷", jawaban: ["brazil", "brasil"], hint: "Juara Piala Dunia terbanyak" },
  { emoji: "🇨🇳", jawaban: ["china", "cina", "tiongkok"], hint: "Negeri Tirai Bambu" },
  { emoji: "🇰🇷", jawaban: ["korea selatan", "south korea", "korsel"], hint: "Negeri K-Pop" },
  { emoji: "🇫🇷", jawaban: ["perancis", "prancis", "france"], hint: "Negeri Menara Eiffel" },
  { emoji: "🇩🇪", jawaban: ["jerman", "germany"], hint: "Negeri Oktoberfest" },
  { emoji: "🇮🇹", jawaban: ["italia", "italy"], hint: "Negeri Pizza & Pasta" },
  { emoji: "🇦🇺", jawaban: ["australia"], hint: "Negeri Kanguru" },
  { emoji: "🇲🇾", jawaban: ["malaysia"], hint: "Tetangga Indonesia" },
  { emoji: "🇸🇬", jawaban: ["singapura", "singapore"], hint: "Negara Kota Asia" },
  { emoji: "🇹🇭", jawaban: ["thailand"], hint: "Negeri Gajah Putih" },
  { emoji: "🇵🇭", jawaban: ["filipina", "philippines"], hint: "Negeri 7000 Pulau" },
  { emoji: "🇮🇳", jawaban: ["india"], hint: "Negeri Bollywood" },
  { emoji: "🇷🇺", jawaban: ["rusia", "russia"], hint: "Negara terluas di dunia" },
  { emoji: "🇬🇧", jawaban: ["inggris", "uk", "united kingdom", "england"], hint: "Negeri Big Ben" },
  { emoji: "🇨🇦", jawaban: ["kanada", "canada"], hint: "Negeri Maple" },
  { emoji: "🇲🇽", jawaban: ["meksiko", "mexico"], hint: "Negeri Taco" },
  { emoji: "🇦🇷", jawaban: ["argentina"], hint: "Negeri Tango & Messi" },
  { emoji: "🇿🇦", jawaban: ["afrika selatan", "south africa"], hint: "Ujung selatan Afrika" },
  { emoji: "🇪🇬", jawaban: ["mesir", "egypt"], hint: "Negeri Firaun & Piramid" },
  { emoji: "🇸🇦", jawaban: ["arab saudi", "saudi arabia"], hint: "Negeri Mekah" },
  { emoji: "🇹🇷", jawaban: ["turki", "turkey"], hint: "Negeri dua benua" },
  { emoji: "🇳🇱", jawaban: ["belanda", "netherlands", "holland"], hint: "Negeri Kincir Angin" },
  { emoji: "🇪🇸", jawaban: ["spanyol", "spain"], hint: "Negeri Matador & Flamenco" },
  { emoji: "🇵🇹", jawaban: ["portugal"], hint: "Negara asal Cristiano Ronaldo" },
  { emoji: "🇨🇭", jawaban: ["swiss", "switzerland"], hint: "Negeri netral pegunungan Alpen" },
  { emoji: "🇸🇪", jawaban: ["swedia", "sweden"], hint: "Negara asal IKEA" },
  { emoji: "🇳🇴", jawaban: ["norwegia", "norway"], hint: "Negeri Fjord & aurora" },
  { emoji: "🇫🇮", jawaban: ["finlandia", "finland"], hint: "Negeri Santa Claus" },
  { emoji: "🇩🇰", jawaban: ["denmark"], hint: "Negara asal LEGO" },
  { emoji: "🇧🇪", jawaban: ["belgia", "belgium"], hint: "Negeri Cokelat & Waffle" },
  { emoji: "🇦🇹", jawaban: ["austria"], hint: "Negara asal Mozart" },
  { emoji: "🇬🇷", jawaban: ["yunani", "greece"], hint: "Negeri Para Dewa Mitologi" },
  { emoji: "🇵🇱", jawaban: ["polandia", "poland"], hint: "Negara asal Robert Lewandowski" },
  { emoji: "🇺🇦", jawaban: ["ukraina", "ukraine"], hint: "Negara terbesar di Eropa Timur" },
  { emoji: "🇻🇳", jawaban: ["vietnam"], hint: "Negeri Phở" },
  { emoji: "🇰🇭", jawaban: ["kamboja", "cambodia"], hint: "Negeri Angkor Wat" },
  { emoji: "🇲🇲", jawaban: ["myanmar", "burma"], hint: "Negeri pagoda emas" },
  { emoji: "🇱🇦", jawaban: ["laos"], hint: "Negara tanpa garis pantai di Asia Tenggara" },
  { emoji: "🇧🇳", jawaban: ["brunei"], hint: "Negara kaya minyak di Kalimantan" },
  { emoji: "🇳🇿", jawaban: ["selandia baru", "new zealand"], hint: "Negara syuting Lord of the Rings" },
  { emoji: "🇵🇰", jawaban: ["pakistan"], hint: "Negara tetangga India bagian barat" },
  { emoji: "🇧🇩", jawaban: ["bangladesh"], hint: "Negara delta sungai terbesar dunia" },
  { emoji: "🇮🇷", jawaban: ["iran"], hint: "Negeri Persia" },
  { emoji: "🇮🇶", jawaban: ["irak", "iraq"], hint: "Negeri Mesopotamia kuno" },
  { emoji: "🇮🇱", jawaban: ["israel"], hint: "Negara di Yerusalem" },
  { emoji: "🇶🇦", jawaban: ["qatar"], hint: "Tuan rumah Piala Dunia 2022" },
  { emoji: "🇦🇪", jawaban: ["uae", "uni emirat arab", "emirat arab"], hint: "Negara dengan Burj Khalifa" },
  { emoji: "🇰🇪", jawaban: ["kenya"], hint: "Negeri pelari maraton tercepat" },
  { emoji: "🇳🇬", jawaban: ["nigeria"], hint: "Negara berpenduduk terbanyak di Afrika" },
  { emoji: "🇲🇦", jawaban: ["maroko", "morocco"], hint: "Negeri Casablanca" },
  { emoji: "🇨🇱", jawaban: ["chili", "chile"], hint: "Negara terpanjang di Amerika Selatan" },
  { emoji: "🇨🇴", jawaban: ["kolombia", "colombia"], hint: "Negara asal kopi terkenal" },
  { emoji: "🇵🇪", jawaban: ["peru"], hint: "Negeri Machu Picchu" },
  { emoji: "🇨🇺", jawaban: ["kuba", "cuba"], hint: "Negara kepulauan komunis di Karibia" },
  { emoji: "🇮🇪", jawaban: ["irlandia", "ireland"], hint: "Negeri Shamrock" },
  { emoji: "🇮🇸", jawaban: ["islandia", "iceland"], hint: "Negeri Geyser & Aurora" },
  // ── Afrika ──
  { emoji: "🇩🇿", jawaban: ["aljazair", "algeria"], hint: "Negara terbesar di Afrika dari segi luas wilayah" },
  { emoji: "🇦🇴", jawaban: ["angola"], hint: "Negara bekas jajahan Portugis di Afrika Selatan" },
  { emoji: "🇧🇯", jawaban: ["benin"], hint: "Negara Afrika Barat, dulu bernama Dahomey" },
  { emoji: "🇧🇼", jawaban: ["botswana"], hint: "Negara penghasil berlian di Afrika Selatan" },
  { emoji: "🇧🇫", jawaban: ["burkina faso"], hint: "Negara Afrika Barat tanpa garis pantai" },
  { emoji: "🇧🇮", jawaban: ["burundi"], hint: "Negara kecil di Afrika Timur dekat Danau Tanganyika" },
  { emoji: "🇨🇻", jawaban: ["cabo verde", "tanjung verde"], hint: "Negara kepulauan di lepas pantai Afrika Barat" },
  { emoji: "🇨🇲", jawaban: ["kamerun", "cameroon"], hint: "Negara berbentuk segitiga di Afrika Tengah" },
  { emoji: "🇨🇫", jawaban: ["republik afrika tengah"], hint: "Negara tanpa garis pantai di tengah Afrika" },
  { emoji: "🇹🇩", jawaban: ["chad"], hint: "Negara gurun di Afrika Tengah dengan danau besar" },
  { emoji: "🇰🇲", jawaban: ["komoro", "comoros"], hint: "Negara kepulauan kecil di Samudra Hindia" },
  { emoji: "🇨🇬", jawaban: ["kongo", "republik kongo"], hint: "Negara Afrika Tengah, ibukotanya Brazzaville" },
  { emoji: "🇨🇩", jawaban: ["kongo kinshasa", "republik demokratik kongo"], hint: "Negara terbesar kedua di Afrika, ibukotanya Kinshasa" },
  { emoji: "🇩🇯", jawaban: ["djibouti"], hint: "Negara kecil di Tanduk Afrika" },
  { emoji: "🇬🇶", jawaban: ["guinea khatulistiwa"], hint: "Negara penghasil minyak di Afrika Tengah" },
  { emoji: "🇪🇷", jawaban: ["eritrea"], hint: "Negara di Tanduk Afrika, dulu bagian dari Ethiopia" },
  { emoji: "🇸🇿", jawaban: ["eswatini", "swaziland"], hint: "Kerajaan kecil di Afrika Selatan" },
  { emoji: "🇪🇹", jawaban: ["etiopia", "ethiopia"], hint: "Negara Afrika yang tidak pernah lama dijajah" },
  { emoji: "🇬🇦", jawaban: ["gabon"], hint: "Negara hutan tropis di Afrika Tengah" },
  { emoji: "🇬🇲", jawaban: ["gambia"], hint: "Negara terkecil di daratan Afrika" },
  { emoji: "🇬🇭", jawaban: ["ghana"], hint: "Negara Afrika Barat, dulu bernama Gold Coast" },
  { emoji: "🇬🇳", jawaban: ["guinea"], hint: "Negara Afrika Barat penghasil bauksit" },
  { emoji: "🇬🇼", jawaban: ["guinea-bissau", "guinea bissau"], hint: "Negara kecil bekas jajahan Portugis di Afrika Barat" },
  { emoji: "🇨🇮", jawaban: ["pantai gading", "ivory coast"], hint: "Negara penghasil kakao terbesar di dunia" },
  { emoji: "🇱🇸", jawaban: ["lesotho"], hint: "Kerajaan yang dikelilingi penuh oleh Afrika Selatan" },
  { emoji: "🇱🇷", jawaban: ["liberia"], hint: "Negara Afrika yang didirikan oleh budak yang dimerdekakan" },
  { emoji: "🇱🇾", jawaban: ["libya"], hint: "Negara gurun di Afrika Utara dekat Laut Mediterania" },
  { emoji: "🇲🇬", jawaban: ["madagaskar", "madagascar"], hint: "Negara kepulauan besar di Samudra Hindia" },
  { emoji: "🇲🇼", jawaban: ["malawi"], hint: "Negara kecil dengan danau besar di Afrika Timur" },
  { emoji: "🇲🇱", jawaban: ["mali"], hint: "Negara Afrika Barat, rumah kota kuno Timbuktu" },
  { emoji: "🇲🇷", jawaban: ["mauritania"], hint: "Negara gurun luas di Afrika Barat" },
  { emoji: "🇲🇺", jawaban: ["mauritius"], hint: "Negara kepulauan wisata di Samudra Hindia dekat Madagaskar" },
  { emoji: "🇲🇿", jawaban: ["mozambik", "mozambique"], hint: "Negara pesisir panjang di Afrika Tenggara" },
  { emoji: "🇳🇦", jawaban: ["namibia"], hint: "Negara dengan gurun Namib di Afrika Selatan" },
  { emoji: "🇳🇪", jawaban: ["niger"], hint: "Negara gurun luas di Afrika Barat, dekat Nigeria" },
  { emoji: "🇷🇼", jawaban: ["rwanda"], hint: "Negeri Seribu Bukit di Afrika Timur" },
  { emoji: "🇸🇹", jawaban: ["sao tome", "sao tome and principe"], hint: "Negara kepulauan kecil di Teluk Guinea" },
  { emoji: "🇸🇳", jawaban: ["senegal"], hint: "Negara paling barat di daratan Afrika" },
  { emoji: "🇸🇨", jawaban: ["seychelles"], hint: "Negara kepulauan wisata mewah di Samudra Hindia" },
  { emoji: "🇸🇱", jawaban: ["sierra leone"], hint: "Negara Afrika Barat penghasil berlian" },
  { emoji: "🇸🇴", jawaban: ["somalia"], hint: "Negara di ujung Tanduk Afrika" },
  { emoji: "🇸🇸", jawaban: ["sudan selatan", "south sudan"], hint: "Negara termuda di dunia, merdeka tahun 2011" },
  { emoji: "🇸🇩", jawaban: ["sudan"], hint: "Negara besar di Afrika Timur Laut" },
  { emoji: "🇹🇿", jawaban: ["tanzania"], hint: "Negara dengan Gunung Kilimanjaro" },
  { emoji: "🇹🇬", jawaban: ["togo"], hint: "Negara kecil memanjang di Afrika Barat" },
  { emoji: "🇺🇬", jawaban: ["uganda"], hint: "Negara di sumber Sungai Nil" },
  { emoji: "🇿🇲", jawaban: ["zambia"], hint: "Negara dengan Air Terjun Victoria" },
  { emoji: "🇿🇼", jawaban: ["zimbabwe"], hint: "Negara Afrika Selatan dengan Air Terjun Victoria" },
  // ── Amerika ──
  { emoji: "🇦🇬", jawaban: ["antigua dan barbuda", "antigua and barbuda"], hint: "Negara kepulauan kecil di Karibia" },
  { emoji: "🇧🇸", jawaban: ["bahama", "bahamas"], hint: "Negara kepulauan wisata dekat Florida" },
  { emoji: "🇧🇧", jawaban: ["barbados"], hint: "Negara pulau di Karibia, tanah lahir Rihanna" },
  { emoji: "🇧🇿", jawaban: ["belize"], hint: "Negara Amerika Tengah berbahasa resmi Inggris" },
  { emoji: "🇨🇷", jawaban: ["kosta rika", "costa rica"], hint: "Negara Amerika Tengah dengan hutan hujan tropis" },
  { emoji: "🇩🇲", jawaban: ["dominica"], hint: "Negara pulau kecil di Karibia (bukan Republik Dominika)" },
  { emoji: "🇩🇴", jawaban: ["republik dominika", "dominican republic"], hint: "Negara di pulau Hispaniola, terkenal bisbol" },
  { emoji: "🇸🇻", jawaban: ["el salvador"], hint: "Negara terkecil di Amerika Tengah" },
  { emoji: "🇬🇩", jawaban: ["grenada"], hint: "Negara pulau kecil yang dijuluki Pulau Rempah" },
  { emoji: "🇬🇹", jawaban: ["guatemala"], hint: "Negara Amerika Tengah, bekas pusat peradaban Maya" },
  { emoji: "🇭🇹", jawaban: ["haiti"], hint: "Negara pertama yang merdeka dari perbudakan di Amerika" },
  { emoji: "🇭🇳", jawaban: ["honduras"], hint: "Negara Amerika Tengah dengan reruntuhan Maya Copán" },
  { emoji: "🇯🇲", jawaban: ["jamaika", "jamaica"], hint: "Negara asal musik reggae" },
  { emoji: "🇳🇮", jawaban: ["nikaragua", "nicaragua"], hint: "Negara terbesar di Amerika Tengah" },
  { emoji: "🇵🇦", jawaban: ["panama"], hint: "Negara dengan terusan/kanal terkenal" },
  { emoji: "🇰🇳", jawaban: ["saint kitts dan nevis", "saint kitts and nevis"], hint: "Negara terkecil di benua Amerika" },
  { emoji: "🇱🇨", jawaban: ["saint lucia"], hint: "Negara pulau kecil di Karibia dengan gunung Piton" },
  { emoji: "🇻🇨", jawaban: ["saint vincent"], hint: "Negara kepulauan kecil di Karibia" },
  { emoji: "🇹🇹", jawaban: ["trinidad dan tobago", "trinidad and tobago"], hint: "Negara asal alat musik steel drum" },
  { emoji: "🇧🇴", jawaban: ["bolivia"], hint: "Negara Amerika Selatan dengan dua ibukota" },
  { emoji: "🇪🇨", jawaban: ["ekuador", "ecuador"], hint: "Negara yang dilewati garis khatulistiwa" },
  { emoji: "🇬🇾", jawaban: ["guyana"], hint: "Negara Amerika Selatan berbahasa resmi Inggris" },
  { emoji: "🇵🇾", jawaban: ["paraguay"], hint: "Negara tanpa garis pantai di Amerika Selatan" },
  { emoji: "🇸🇷", jawaban: ["suriname"], hint: "Negara kecil di Amerika Selatan dengan banyak keturunan Jawa" },
  { emoji: "🇺🇾", jawaban: ["uruguay"], hint: "Negara kecil di antara Brazil dan Argentina" },
  { emoji: "🇻🇪", jawaban: ["venezuela"], hint: "Negara dengan air terjun tertinggi di dunia, Air Terjun Angel" },
  // ── Asia ──
  { emoji: "🇦🇫", jawaban: ["afganistan", "afghanistan"], hint: "Negara pegunungan di Asia Tengah-Selatan" },
  { emoji: "🇦🇲", jawaban: ["armenia"], hint: "Negara pegunungan Kaukasus, salah satu negara Kristen tertua" },
  { emoji: "🇦🇿", jawaban: ["azerbaijan"], hint: "Negara penghasil minyak di Pegunungan Kaukasus" },
  { emoji: "🇧🇭", jawaban: ["bahrain"], hint: "Negara kepulauan kecil di Teluk Persia" },
  { emoji: "🇧🇹", jawaban: ["bhutan"], hint: "Negara kerajaan kecil di Pegunungan Himalaya" },
  { emoji: "🇨🇾", jawaban: ["siprus", "cyprus"], hint: "Negara pulau di Mediterania Timur" },
  { emoji: "🇬🇪", jawaban: ["georgia"], hint: "Negara pegunungan Kaukasus, asal anggur tertua di dunia" },
  { emoji: "🇯🇴", jawaban: ["yordania", "jordan"], hint: "Negara Timur Tengah dengan kota kuno Petra" },
  { emoji: "🇰🇿", jawaban: ["kazakhstan"], hint: "Negara terbesar di Asia Tengah" },
  { emoji: "🇰🇼", jawaban: ["kuwait"], hint: "Negara kaya minyak di Teluk Persia" },
  { emoji: "🇰🇬", jawaban: ["kirgistan", "kyrgyzstan"], hint: "Negara pegunungan di Asia Tengah" },
  { emoji: "🇱🇧", jawaban: ["lebanon"], hint: "Negara kecil di Timur Tengah, ibukotanya Beirut" },
  { emoji: "🇲🇻", jawaban: ["maladewa", "maldives"], hint: "Negara kepulauan terendah di dunia" },
  { emoji: "🇲🇳", jawaban: ["mongolia"], hint: "Negara padang rumput luas, asal Genghis Khan" },
  { emoji: "🇳🇵", jawaban: ["nepal"], hint: "Negara rumah Gunung Everest" },
  { emoji: "🇰🇵", jawaban: ["korea utara", "north korea"], hint: "Negara tertutup di bagian utara Semenanjung Korea" },
  { emoji: "🇴🇲", jawaban: ["oman"], hint: "Negara di ujung timur Jazirah Arab" },
  { emoji: "🇵🇸", jawaban: ["palestina", "palestine"], hint: "Wilayah di Timur Tengah dekat Israel" },
  { emoji: "🇱🇰", jawaban: ["sri lanka"], hint: "Negara pulau berbentuk tetesan air mata di selatan India" },
  { emoji: "🇸🇾", jawaban: ["suriah", "syria"], hint: "Negara di Timur Mediterania, ibukotanya Damaskus" },
  { emoji: "🇹🇯", jawaban: ["tajikistan"], hint: "Negara pegunungan di Asia Tengah" },
  { emoji: "🇹🇱", jawaban: ["timor leste", "timor-leste"], hint: "Negara muda dekat Indonesia, merdeka tahun 2002" },
  { emoji: "🇹🇲", jawaban: ["turkmenistan"], hint: "Negara gurun di Asia Tengah" },
  { emoji: "🇺🇿", jawaban: ["uzbekistan"], hint: "Negara Asia Tengah dengan kota kuno Samarkand" },
  { emoji: "🇾🇪", jawaban: ["yaman", "yemen"], hint: "Negara di ujung selatan Jazirah Arab" },
  // ── Eropa ──
  { emoji: "🇦🇱", jawaban: ["albania"], hint: "Negara Balkan di tepi Laut Adriatik" },
  { emoji: "🇦🇩", jawaban: ["andorra"], hint: "Negara kecil di Pegunungan Pyrenees" },
  { emoji: "🇧🇾", jawaban: ["belarus"], hint: "Negara Eropa Timur, dulu bagian Uni Soviet" },
  { emoji: "🇧🇦", jawaban: ["bosnia", "bosnia dan herzegovina"], hint: "Negara Balkan, ibukotanya Sarajevo" },
  { emoji: "🇧🇬", jawaban: ["bulgaria"], hint: "Negara Balkan penghasil mawar" },
  { emoji: "🇭🇷", jawaban: ["kroasia", "croatia"], hint: "Negara Balkan dengan pantai indah di Laut Adriatik" },
  { emoji: "🇨🇿", jawaban: ["ceko", "republik ceko"], hint: "Negara dengan kota Praha yang indah" },
  { emoji: "🇪🇪", jawaban: ["estonia"], hint: "Negara Baltik kecil dengan teknologi digital maju" },
  { emoji: "🇭🇺", jawaban: ["hungaria", "hungary"], hint: "Negara Eropa Tengah, ibukotanya Budapest" },
  { emoji: "🇱🇻", jawaban: ["latvia"], hint: "Negara Baltik di tepi Laut Baltik" },
  { emoji: "🇱🇮", jawaban: ["liechtenstein"], hint: "Negara kerajaan kecil di antara Swiss dan Austria" },
  { emoji: "🇱🇹", jawaban: ["lithuania"], hint: "Negara Baltik terbesar" },
  { emoji: "🇱🇺", jawaban: ["luksemburg", "luxembourg"], hint: "Negara kecil kaya di Eropa Barat" },
  { emoji: "🇲🇹", jawaban: ["malta"], hint: "Negara pulau kecil di Mediterania dekat Italia" },
  { emoji: "🇲🇩", jawaban: ["moldova"], hint: "Negara kecil di antara Rumania dan Ukraina" },
  { emoji: "🇲🇨", jawaban: ["monako", "monaco"], hint: "Negara terkecil kedua di dunia, terkenal balap F1" },
  { emoji: "🇲🇪", jawaban: ["montenegro"], hint: "Negara Balkan kecil di tepi Laut Adriatik" },
  { emoji: "🇲🇰", jawaban: ["makedonia utara", "north macedonia"], hint: "Negara Balkan, dulu bagian dari Yugoslavia" },
  { emoji: "🇷🇴", jawaban: ["rumania", "romania"], hint: "Negara Eropa Timur, asal legenda Dracula" },
  { emoji: "🇸🇲", jawaban: ["san marino"], hint: "Salah satu negara terkecil & tertua di dunia" },
  { emoji: "🇷🇸", jawaban: ["serbia"], hint: "Negara Balkan, ibukotanya Beograd" },
  { emoji: "🇸🇰", jawaban: ["slovakia"], hint: "Negara Eropa Tengah, dulu satu negara dengan Ceko" },
  { emoji: "🇸🇮", jawaban: ["slovenia"], hint: "Negara kecil yang hijau di Eropa Tengah" },
  { emoji: "🇻🇦", jawaban: ["vatikan", "vatican"], hint: "Negara terkecil di dunia, pusat Gereja Katolik" },
  // ── Oseania ──
  { emoji: "🇫🇯", jawaban: ["fiji"], hint: "Negara kepulauan di Pasifik Selatan" },
  { emoji: "🇰🇮", jawaban: ["kiribati"], hint: "Negara kepulauan kecil di Pasifik, salah satu yang pertama masuk Tahun Baru" },
  { emoji: "🇲🇭", jawaban: ["kepulauan marshall", "marshall islands"], hint: "Negara kepulauan kecil di Pasifik" },
  { emoji: "🇫🇲", jawaban: ["mikronesia", "micronesia"], hint: "Negara federasi kepulauan kecil di Pasifik" },
  { emoji: "🇳🇷", jawaban: ["nauru"], hint: "Negara terkecil di Pasifik, salah satu terkecil di dunia" },
  { emoji: "🇵🇼", jawaban: ["palau"], hint: "Negara kepulauan kecil terkenal wisata diving" },
  { emoji: "🇵🇬", jawaban: ["papua nugini", "papua new guinea"], hint: "Negara tetangga Indonesia di sebelah timur Papua" },
  { emoji: "🇼🇸", jawaban: ["samoa"], hint: "Negara kepulauan di Pasifik Selatan" },
  { emoji: "🇸🇧", jawaban: ["kepulauan solomon", "solomon islands"], hint: "Negara kepulauan di Pasifik dekat Papua Nugini" },
  { emoji: "🇹🇴", jawaban: ["tonga"], hint: "Kerajaan kepulauan di Pasifik Selatan" },
  { emoji: "🇹🇻", jawaban: ["tuvalu"], hint: "Salah satu negara terkecil di dunia, rawan tenggelam" },
  { emoji: "🇻🇺", jawaban: ["vanuatu"], hint: "Negara kepulauan vulkanik di Pasifik Selatan" },
];

const TEBAK_KATA_DATA = [
  { soal: "Hewan berkaki empat, suka mengeong", jawaban: "kucing", hint: "K***ng" },
  { soal: "Buah berwarna kuning, suka dimakan monyet", jawaban: "pisang", hint: "P***ng" },
  { soal: "Kendaraan roda dua bermesin", jawaban: "motor", hint: "M***r" },
  { soal: "Tempat menyimpan uang yang besar & resmi", jawaban: "bank", hint: "B**k" },
  { soal: "Alat komunikasi genggam modern", jawaban: "handphone", hint: "H*******e" },
  { soal: "Bintang terdekat dari bumi", jawaban: "matahari", hint: "M*****i" },
  { soal: "Hewan laut terbesar", jawaban: "paus", hint: "P**s" },
  { soal: "Bumbu masak berwarna merah & pedas", jawaban: "cabai", hint: "C***i" },
  { soal: "Alat tulis ujungnya lancip", jawaban: "pensil", hint: "P***il" },
  { soal: "Tempat tinggal raja", jawaban: "istana", hint: "I***na" },
  { soal: "Buah tropis berduri, baunya khas", jawaban: "durian", hint: "D***an" },
  { soal: "Hewan melata berbisa", jawaban: "ular", hint: "U**r" },
  { soal: "Olahraga menggunakan raket & kok", jawaban: "badminton", hint: "B*******n" },
  { soal: "Minuman panas dari daun teh", jawaban: "teh", hint: "T*h" },
  { soal: "Planet ketiga dari matahari", jawaban: "bumi", hint: "B**i" },
  { soal: "Tempat belajar anak-anak setiap hari", jawaban: "sekolah", hint: "S*****h" },
  { soal: "Hewan berbadan besar, hidungnya panjang", jawaban: "gajah", hint: "G***h" },
  { soal: "Alat masak untuk menggoreng", jawaban: "wajan", hint: "W***n" },
  { soal: "Buah berwarna merah, identik dengan apel tapi lebih kecil & asam", jawaban: "stroberi", hint: "S*******i" },
  { soal: "Hewan yang bisa terbang, suka makan nektar bunga", jawaban: "kupu-kupu", hint: "K*******u" },
  { soal: "Tempat menyimpan pakaian", jawaban: "lemari", hint: "L***ri" },
  { soal: "Alat untuk melihat waktu", jawaban: "jam", hint: "J*m" },
  { soal: "Kendaraan besar untuk terbang", jawaban: "pesawat", hint: "P*****t" },
  { soal: "Minuman dingin dari susu, biasa ada di kafe", jawaban: "milkshake", hint: "M********e" },
  { soal: "Hewan peliharaan yang setia, suka menggonggong", jawaban: "anjing", hint: "A***ng" },
  { soal: "Tempat ikan-ikan dipelihara di rumah", jawaban: "akuarium", hint: "A******m" },
  { soal: "Alat untuk memotong rambut", jawaban: "gunting", hint: "G*****g" },
  { soal: "Buah berwarna hijau di luar, merah di dalam, bijinya hitam", jawaban: "semangka", hint: "S******a" },
  { soal: "Tempat menyimpan buku-buku untuk dibaca", jawaban: "perpustakaan", hint: "P***********n" },
  { soal: "Hewan yang hidup di air dan darat, suka melompat", jawaban: "katak", hint: "K***k" },
  { soal: "Alat musik bersenar, dipetik", jawaban: "gitar", hint: "G***r" },
  { soal: "Sayuran berwarna oranye, bagus untuk mata", jawaban: "wortel", hint: "W***el" },
  { soal: "Tempat menonton film bareng-bareng", jawaban: "bioskop", hint: "B*****p" },
  { soal: "Olahraga menendang bola ke gawang lawan", jawaban: "sepakbola", hint: "S********a" },
  { soal: "Hewan raja hutan, badannya besar dan punya surai", jawaban: "singa", hint: "S***a" },
  { soal: "Alat untuk menulis di papan tulis", jawaban: "kapur", hint: "K***r" },
  { soal: "Tempat tinggal lebah", jawaban: "sarang", hint: "S***ng" },
  { soal: "Minuman hasil fermentasi susu, asam dan creamy", jawaban: "yogurt", hint: "Y*g**t" },
  { soal: "Bangunan tinggi untuk memandu kapal di malam hari", jawaban: "menara suar", hint: "M***** S**r" },
  { soal: "Alat transportasi roda empat pribadi", jawaban: "mobil", hint: "M***l" },
  { soal: "Hewan pengerat kecil yang suka keju", jawaban: "tikus", hint: "T***s" },
  { soal: "Sayuran hijau berbentuk bulat, biasa dibuat sup", jawaban: "kol", hint: "K*l" },
  { soal: "Tempat menyimpan makanan agar tetap dingin", jawaban: "kulkas", hint: "K***as" },
  { soal: "Alat untuk mengukur suhu tubuh", jawaban: "termometer", hint: "T*********r" },
  { soal: "Hewan laut bercangkang, jalannya lambat", jawaban: "siput", hint: "S***t" },
  { soal: "Buah berduri di luar, lembut & manis di dalam, beda dari durian", jawaban: "nanas", hint: "N***s" },
  { soal: "Profesi yang mengobati orang sakit", jawaban: "dokter", hint: "D***er" },
  { soal: "Tempat para astronot tinggal sementara di luar angkasa", jawaban: "stasiun luar angkasa", hint: "S******n L*** A*****a" },
  { soal: "Alat untuk membersihkan lantai dari debu", jawaban: "sapu", hint: "S*pu" },
  { soal: "Hewan berleher panjang, makan daun di pucuk pohon", jawaban: "jerapah", hint: "J*****h" },
  { soal: "Alat untuk menyemprotkan air, biasa dipakai nyuci motor/mobil", jawaban: "selang", hint: "S***ng" },
  { soal: "Tempat ibadah umat Islam", jawaban: "masjid", hint: "M***id" },
  { soal: "Tempat ibadah umat Kristen", jawaban: "gereja", hint: "G***ja" },
  { soal: "Alat untuk menerangi ruangan di malam hari", jawaban: "lampu", hint: "L***u" },
  { soal: "Hewan berbulu putih yang hidup di kutub", jawaban: "beruang kutub", hint: "B****ng K***b" },
  { soal: "Buah kecil warna ungu, biasa dibuat jus dan jeli", jawaban: "anggur", hint: "A***ur" },
  { soal: "Alat musik tiup yang biasa dipakai pramuka", jawaban: "peluit", hint: "P***it" },
  { soal: "Hewan kecil yang menghasilkan madu", jawaban: "lebah", hint: "L***h" },
  { soal: "Tempat parkir pesawat dan terminal penumpang", jawaban: "bandara", hint: "B***ra" },
  { soal: "Benda langit yang mengelilingi bumi di malam hari", jawaban: "bulan", hint: "B**an" },
  { soal: "Alat masak untuk merebus air", jawaban: "panci", hint: "P***i" },
  { soal: "Hewan bertubuh besar dengan cula di kepala", jawaban: "badak", hint: "B***k" },
  { soal: "Tempat menyimpan kendaraan di rumah", jawaban: "garasi", hint: "G***si" },
  { soal: "Alat untuk membersihkan kaca jendela", jawaban: "lap", hint: "L*p" },
];

const KUIS_DATA = [
  { soal: "Ibukota Indonesia adalah?", opsi: ["A. Jakarta","B. Surabaya","C. Bandung","D. Medan"], jawaban: "A", explain: "Jakarta adalah ibukota Indonesia." },
  { soal: "Presiden pertama Indonesia?", opsi: ["A. Soeharto","B. Habibie","C. Soekarno","D. Megawati"], jawaban: "C", explain: "Ir. Soekarno (1945-1967)." },
  { soal: "Satelit alami Bumi?", opsi: ["A. Mars","B. Venus","C. Bulan","D. Jupiter"], jawaban: "C", explain: "Bulan adalah satu-satunya satelit alami Bumi." },
  { soal: "Jumlah provinsi Indonesia (2024)?", opsi: ["A. 33","B. 34","C. 37","D. 38"], jawaban: "D", explain: "Setelah pemekaran Papua menjadi 38 provinsi." },
  { soal: "Danau terluas di Indonesia?", opsi: ["A. Danau Toba","B. Danau Poso","C. Danau Maninjau","D. Danau Singkarak"], jawaban: "A", explain: "Danau Toba, Sumatera Utara." },
  { soal: "Simbol hewan WWF?", opsi: ["A. Harimau","B. Singa","C. Panda","D. Gajah"], jawaban: "C", explain: "Giant Panda, logo WWF sejak 1961." },
  { soal: "Python dibuat oleh?", opsi: ["A. Linus","B. Guido van Rossum","C. Bill Gates","D. Mark Z"], jawaban: "B", explain: "Guido van Rossum, 1991." },
  { soal: "Gas terbanyak di atmosfer?", opsi: ["A. Oksigen","B. CO2","C. Nitrogen","D. Hidrogen"], jawaban: "C", explain: "Nitrogen ~78% atmosfer Bumi." },
  { soal: "Penemu telepon?", opsi: ["A. Edison","B. Newton","C. Graham Bell","D. Tesla"], jawaban: "C", explain: "Alexander Graham Bell, 1876." },
  { soal: "Gunung tertinggi di dunia?", opsi: ["A. Kilimanjaro","B. Everest","C. K2","D. Elbrus"], jawaban: "B", explain: "Gunung Everest 8.848 m." },
  { soal: "Mata uang Jepang adalah?", opsi: ["A. Won","B. Yen","C. Yuan","D. Baht"], jawaban: "B", explain: "Yen adalah mata uang resmi Jepang." },
  { soal: "Lautan terbesar di dunia?", opsi: ["A. Atlantik","B. Hindia","C. Pasifik","D. Arktik"], jawaban: "C", explain: "Samudra Pasifik adalah yang terbesar." },
  { soal: "Penemu lampu pijar?", opsi: ["A. Thomas Edison","B. Nikola Tesla","C. James Watt","D. Isaac Newton"], jawaban: "A", explain: "Thomas Edison, 1879." },
  { soal: "Hewan nasional Indonesia?", opsi: ["A. Garuda","B. Komodo","C. Harimau Sumatera","D. Orangutan"], jawaban: "A", explain: "Garuda adalah simbol negara Indonesia." },
  { soal: "Negara dengan penduduk terbanyak di dunia (2024)?", opsi: ["A. China","B. Amerika Serikat","C. India","D. Indonesia"], jawaban: "C", explain: "India melampaui China sejak 2023." },
  { soal: "Berapa jumlah benua di dunia?", opsi: ["A. 5","B. 6","C. 7","D. 8"], jawaban: "C", explain: "Ada 7 benua: Asia, Afrika, Amerika Utara, Amerika Selatan, Antartika, Eropa, Australia." },
  { soal: "Planet terbesar di tata surya?", opsi: ["A. Saturnus","B. Jupiter","C. Bumi","D. Neptunus"], jawaban: "B", explain: "Jupiter adalah planet terbesar di tata surya." },
  { soal: "Penulis lagu kebangsaan Indonesia Raya?", opsi: ["A. W.R. Supratman","B. Ismail Marzuki","C. Kusbini","D. C. Simanjuntak"], jawaban: "A", explain: "W.R. Supratman menciptakan Indonesia Raya." },
  { soal: "Hewan terbesar di dunia?", opsi: ["A. Gajah Afrika","B. Paus Biru","C. Hiu Paus","D. Jerapah"], jawaban: "B", explain: "Paus biru adalah hewan terbesar yang pernah ada." },
  { soal: "Ibukota Jepang?", opsi: ["A. Osaka","B. Kyoto","C. Tokyo","D. Nagoya"], jawaban: "C", explain: "Tokyo adalah ibukota Jepang." },
  { soal: "Pencipta Microsoft?", opsi: ["A. Steve Jobs","B. Bill Gates","C. Mark Zuckerberg","D. Elon Musk"], jawaban: "B", explain: "Bill Gates mendirikan Microsoft tahun 1975." },
  { soal: "Negara asal sushi?", opsi: ["A. China","B. Korea Selatan","C. Jepang","D. Thailand"], jawaban: "C", explain: "Sushi berasal dari Jepang." },
  { soal: "Bahasa resmi Brazil?", opsi: ["A. Spanyol","B. Portugis","C. Inggris","D. Prancis"], jawaban: "B", explain: "Bahasa Portugis adalah bahasa resmi Brazil." },
  { soal: "Penemu teori relativitas?", opsi: ["A. Isaac Newton","B. Albert Einstein","C. Stephen Hawking","D. Galileo Galilei"], jawaban: "B", explain: "Albert Einstein mengembangkan teori relativitas." },
  { soal: "Pulau terbesar di Indonesia?", opsi: ["A. Jawa","B. Sumatera","C. Kalimantan","D. Papua"], jawaban: "C", explain: "Kalimantan adalah pulau terbesar di Indonesia (dan ketiga di dunia)." },
  { soal: "Hewan khas Australia yang melompat?", opsi: ["A. Koala","B. Kanguru","C. Wombat","D. Platypus"], jawaban: "B", explain: "Kanguru adalah hewan ikonik Australia." },
  { soal: "Tulang terkuat dalam tubuh manusia?", opsi: ["A. Tulang Rusuk","B. Tulang Paha (Femur)","C. Tulang Tengkorak","D. Tulang Lengan"], jawaban: "B", explain: "Tulang femur (paha) adalah tulang terkuat dan terpanjang." },
  { soal: "Pendiri Apple Inc.?", opsi: ["A. Bill Gates","B. Steve Jobs","C. Jeff Bezos","D. Larry Page"], jawaban: "B", explain: "Steve Jobs mendirikan Apple bersama Steve Wozniak." },
  { soal: "Sungai terpanjang di dunia?", opsi: ["A. Amazon","B. Nil","C. Yangtze","D. Mississippi"], jawaban: "B", explain: "Sungai Nil adalah sungai terpanjang di dunia." },
  { soal: "Olimpiade modern pertama diadakan di kota?", opsi: ["A. Paris","B. London","C. Athena","D. Roma"], jawaban: "C", explain: "Olimpiade modern pertama diadakan di Athena, 1896." },
  { soal: "Negara penghasil kopi terbesar di dunia?", opsi: ["A. Indonesia","B. Vietnam","C. Kolombia","D. Brazil"], jawaban: "D", explain: "Brazil adalah penghasil kopi terbesar di dunia." },
  { soal: "Pencipta lampu lalu lintas?", opsi: ["A. Garrett Morgan","B. Thomas Edison","C. Henry Ford","D. Alexander Bell"], jawaban: "A", explain: "Garrett Morgan menciptakan lampu lalu lintas otomatis." },
  { soal: "Hewan yang dapat berubah warna kulit?", opsi: ["A. Iguana","B. Bunglon","C. Komodo","D. Salamander"], jawaban: "B", explain: "Bunglon dikenal karena kemampuan kamuflase warnanya." },
  { soal: "Candi Buddha terbesar di dunia?", opsi: ["A. Candi Prambanan","B. Angkor Wat","C. Borobudur","D. Candi Mendut"], jawaban: "C", explain: "Candi Borobudur di Magelang adalah candi Buddha terbesar di dunia." },
  { soal: "Negara asal pizza?", opsi: ["A. Spanyol","B. Yunani","C. Italia","D. Prancis"], jawaban: "C", explain: "Pizza berasal dari Italia, khususnya Napoli." },
  { soal: "Ibukota Korea Selatan?", opsi: ["A. Busan","B. Seoul","C. Incheon","D. Daegu"], jawaban: "B", explain: "Seoul adalah ibukota Korea Selatan." },
  { soal: "Penemu teori evolusi?", opsi: ["A. Charles Darwin","B. Gregor Mendel","C. Louis Pasteur","D. Isaac Newton"], jawaban: "A", explain: "Charles Darwin mengembangkan teori evolusi melalui seleksi alam." },
  { soal: "Mata uang Indonesia adalah?", opsi: ["A. Ringgit","B. Rupiah","C. Baht","D. Peso"], jawaban: "B", explain: "Rupiah adalah mata uang resmi Indonesia." },
  { soal: "Hewan apa yang dijuluki 'Si Raja Hutan'?", opsi: ["A. Harimau","B. Singa","C. Beruang","D. Serigala"], jawaban: "B", explain: "Singa dijuluki Raja Hutan meski habitat aslinya sabana." },
  { soal: "Berapa jumlah sila dalam Pancasila?", opsi: ["A. 4","B. 5","C. 6","D. 7"], jawaban: "B", explain: "Pancasila terdiri dari 5 sila." },
  { soal: "Apa nama proses tumbuhan menghasilkan makanan dari cahaya matahari?", opsi: ["A. Respirasi","B. Fotosintesis","C. Transpirasi","D. Fermentasi"], jawaban: "B", explain: "Fotosintesis mengubah cahaya matahari jadi energi bagi tumbuhan." },
  { soal: "Candi Hindu terbesar di Indonesia?", opsi: ["A. Borobudur","B. Prambanan","C. Mendut","D. Kalasan"], jawaban: "B", explain: "Candi Prambanan adalah candi Hindu terbesar di Indonesia." },
  { soal: "Penulis novel Laskar Pelangi?", opsi: ["A. Andrea Hirata","B. Tere Liye","C. Pramoedya Ananta Toer","D. Dee Lestari"], jawaban: "A", explain: "Andrea Hirata menulis novel Laskar Pelangi." },
  { soal: "Hewan apa yang punya leher terpanjang di dunia?", opsi: ["A. Unta","B. Jerapah","C. Kuda Nil","D. Gajah"], jawaban: "B", explain: "Jerapah memiliki leher terpanjang di antara hewan darat." },
  { soal: "Benua terkecil di dunia?", opsi: ["A. Eropa","B. Antartika","C. Australia","D. Afrika"], jawaban: "C", explain: "Australia adalah benua terkecil di dunia." },
  { soal: "Siapa penemu World Wide Web?", opsi: ["A. Bill Gates","B. Tim Berners-Lee","C. Steve Jobs","D. Larry Page"], jawaban: "B", explain: "Tim Berners-Lee menciptakan World Wide Web pada 1989." },
  { soal: "Apa nama ibu kota baru Indonesia?", opsi: ["A. Balikpapan","B. Nusantara","C. Samarinda","D. Palangkaraya"], jawaban: "B", explain: "Nusantara adalah nama ibu kota negara baru Indonesia di Kalimantan Timur." },
  { soal: "Logam apa yang paling banyak digunakan untuk membuat perhiasan mewah?", opsi: ["A. Besi","B. Emas","C. Tembaga","D. Seng"], jawaban: "B", explain: "Emas banyak digunakan untuk perhiasan karena tahan karat dan berkilau." },
  { soal: "Hewan apa yang terkenal bisa hidup ratusan tahun?", opsi: ["A. Kura-kura","B. Anjing","C. Kucing","D. Burung Beo"], jawaban: "A", explain: "Kura-kura raksasa dapat hidup hingga ratusan tahun." },
];

const ENGLISH_DATA = [
  { soal: "Arti 'Beautiful'?", jawaban: ["cantik","indah","elok"], hint: "C****k / I***h" },
  { soal: "Bahasa Inggris 'Kucing'?", jawaban: ["cat"], hint: "C*t" },
  { soal: "Arti 'Dangerous'?", jawaban: ["berbahaya","bahaya"], hint: "B*******a" },
  { soal: "Bahasa Inggris 'Hujan'?", jawaban: ["rain"], hint: "R**n" },
  { soal: "Arti 'Knowledge'?", jawaban: ["pengetahuan","ilmu"], hint: "P**********n" },
  { soal: "Bahasa Inggris 'Bintang'?", jawaban: ["star"], hint: "S**r" },
  { soal: "Arti 'Friendship'?", jawaban: ["persahabatan","pertemanan"], hint: "P**********n" },
  { soal: "Bahasa Inggris 'Murid'?", jawaban: ["student"], hint: "S*****t" },
  { soal: "Arti 'Butterfly'?", jawaban: ["kupu-kupu","kupukupu"], hint: "K*****u" },
  { soal: "Bahasa Inggris 'Semangka'?", jawaban: ["watermelon"], hint: "W**********n" },
  { soal: "Arti 'Earthquake'?", jawaban: ["gempa bumi","gempa"], hint: "G*****i" },
  { soal: "Bahasa Inggris 'Perpustakaan'?", jawaban: ["library"], hint: "L*****y" },
  { soal: "Arti 'Happiness'?", jawaban: ["kebahagiaan","bahagia"], hint: "K**********n" },
  { soal: "Bahasa Inggris 'Gunung'?", jawaban: ["mountain"], hint: "M*******n" },
  { soal: "Arti 'Honest'?", jawaban: ["jujur"], hint: "J***r" },
  { soal: "Bahasa Inggris 'Sungai'?", jawaban: ["river"], hint: "R**er" },
  { soal: "Arti 'Patience'?", jawaban: ["kesabaran","sabar"], hint: "K*********n" },
  { soal: "Bahasa Inggris 'Awan'?", jawaban: ["cloud"], hint: "C***d" },
  { soal: "Arti 'Brave'?", jawaban: ["berani"], hint: "B***ni" },
  { soal: "Bahasa Inggris 'Pohon'?", jawaban: ["tree"], hint: "T*ee" },
  { soal: "Arti 'Generous'?", jawaban: ["dermawan","murah hati"], hint: "D******n" },
  { soal: "Bahasa Inggris 'Jendela'?", jawaban: ["window"], hint: "W*****w" },
  { soal: "Arti 'Curious'?", jawaban: ["penasaran","ingin tahu"], hint: "P*******n" },
  { soal: "Bahasa Inggris 'Kunci'?", jawaban: ["key"], hint: "K*y" },
  { soal: "Arti 'Wisdom'?", jawaban: ["kebijaksanaan"], hint: "K***********n" },
  { soal: "Bahasa Inggris 'Cermin'?", jawaban: ["mirror"], hint: "M*****r" },
  { soal: "Arti 'Lonely'?", jawaban: ["kesepian","sendirian"], hint: "K*******n" },
  { soal: "Bahasa Inggris 'Payung'?", jawaban: ["umbrella"], hint: "U*******a" },
  { soal: "Arti 'Ancient'?", jawaban: ["kuno"], hint: "K*no" },
  { soal: "Bahasa Inggris 'Pelangi'?", jawaban: ["rainbow"], hint: "R*****w" },
  { soal: "Arti 'Stubborn'?", jawaban: ["keras kepala","bebal"], hint: "K**** K****a" },
  { soal: "Bahasa Inggris 'Tangga'?", jawaban: ["stairs","ladder"], hint: "S****s" },
  { soal: "Arti 'Gratitude'?", jawaban: ["rasa syukur","syukur"], hint: "R*** S*****r" },
  { soal: "Bahasa Inggris 'Lilin'?", jawaban: ["candle"], hint: "C***le" },
  { soal: "Arti 'Forgive'?", jawaban: ["memaafkan"], hint: "M********n" },
  { soal: "Bahasa Inggris 'Sarang'?", jawaban: ["nest"], hint: "N*st" },
  { soal: "Arti 'Success'?", jawaban: ["sukses","keberhasilan"], hint: "S***es" },
  { soal: "Bahasa Inggris 'Meja'?", jawaban: ["table"], hint: "T**le" },
  { soal: "Arti 'Strength'?", jawaban: ["kekuatan"], hint: "K*******n" },
  { soal: "Bahasa Inggris 'Kursi'?", jawaban: ["chair"], hint: "C***r" },
  { soal: "Arti 'Beautiful Mind'?", jawaban: ["pikiran indah","pikiran cerdas"], hint: "P***** I***h" },
  { soal: "Bahasa Inggris 'Pintu'?", jawaban: ["door"], hint: "D**r" },
  { soal: "Arti 'Loyalty'?", jawaban: ["kesetiaan","loyalitas"], hint: "K*********n" },
  { soal: "Bahasa Inggris 'Topi'?", jawaban: ["hat"], hint: "H*t" },
  { soal: "Arti 'Adventure'?", jawaban: ["petualangan"], hint: "P**********n" },
  { soal: "Bahasa Inggris 'Sepatu'?", jawaban: ["shoes"], hint: "S***es" },
  { soal: "Arti 'Memory'?", jawaban: ["kenangan","memori"], hint: "K*****n" },
  { soal: "Bahasa Inggris 'Dompet'?", jawaban: ["wallet"], hint: "W***et" },
  { soal: "Arti 'Freedom'?", jawaban: ["kebebasan"], hint: "K*******n" },
  { soal: "Bahasa Inggris 'Sisir'?", jawaban: ["comb"], hint: "C**b" },
  { soal: "Arti 'Victory'?", jawaban: ["kemenangan"], hint: "K*********n" },
];

const KUISJAVA_DATA = [
  { soal: "Ibukota negara Indonesia (Jakarta) berada di provinsi yang terletak di Pulau Jawa, yaitu?", opsi: ["A. Jawa Barat","B. Banten","C. DKI Jakarta","D. Jawa Tengah"], jawaban: "C", explain: "DKI Jakarta adalah provinsi setingkat ibukota yang terletak di Pulau Jawa." },
  { soal: "Gunung berapi paling aktif di Pulau Jawa adalah?", opsi: ["A. Gunung Bromo","B. Gunung Merapi","C. Gunung Semeru","D. Gunung Slamet"], jawaban: "B", explain: "Gunung Merapi di perbatasan Jawa Tengah-Yogyakarta adalah salah satu gunung berapi paling aktif di dunia." },
  { soal: "Candi Buddha terbesar di dunia, Borobudur, terletak di provinsi?", opsi: ["A. Jawa Timur","B. Jawa Tengah","C. Yogyakarta","D. Jawa Barat"], jawaban: "B", explain: "Candi Borobudur berada di Magelang, Jawa Tengah." },
  { soal: "Wayang yang terbuat dari kulit dan dimainkan dengan bayangan disebut?", opsi: ["A. Wayang Golek","B. Wayang Orang","C. Wayang Kulit","D. Wayang Suket"], jawaban: "C", explain: "Wayang Kulit adalah seni pertunjukan bayangan khas Jawa." },
  { soal: "Alat musik tradisional Jawa berupa gong, kenong, saron, dll disebut?", opsi: ["A. Angklung","B. Gamelan","C. Kolintang","D. Sasando"], jawaban: "B", explain: "Gamelan adalah ensemble musik tradisional khas Jawa." },
  { soal: "Kerajaan Hindu-Buddha terbesar yang pernah berdiri di Jawa Timur adalah?", opsi: ["A. Mataram Kuno","B. Singasari","C. Majapahit","D. Demak"], jawaban: "C", explain: "Majapahit adalah kerajaan terbesar di Nusantara, berpusat di Jawa Timur." },
  { soal: "Kota yang dijuluki 'Kota Pelajar' di Jawa adalah?", opsi: ["A. Solo","B. Semarang","C. Yogyakarta","D. Malang"], jawaban: "C", explain: "Yogyakarta dijuluki Kota Pelajar karena banyak universitas di sana." },
  { soal: "Batik yang berasal dari Jawa sudah diakui UNESCO sebagai?", opsi: ["A. Warisan Alam Dunia","B. Warisan Budaya Takbenda Dunia","C. Cagar Biosfer","D. Situs Sejarah Dunia"], jawaban: "B", explain: "Batik Indonesia diakui UNESCO sebagai Warisan Budaya Takbenda sejak 2009." },
  { soal: "Bahasa daerah dengan jumlah penutur terbanyak di Indonesia adalah?", opsi: ["A. Bahasa Sunda","B. Bahasa Jawa","C. Bahasa Madura","D. Bahasa Bali"], jawaban: "B", explain: "Bahasa Jawa memiliki jumlah penutur terbanyak di antara bahasa daerah di Indonesia." },
  { soal: "Makanan khas Yogyakarta yang berbahan dasar nangka muda adalah?", opsi: ["A. Rawon","B. Gudeg","C. Rujak Cingur","D. Soto Lamongan"], jawaban: "B", explain: "Gudeg adalah makanan khas Yogyakarta berbahan dasar nangka muda." },
  { soal: "Keraton yang menjadi pusat budaya Jawa di Yogyakarta dipimpin oleh seorang?", opsi: ["A. Sultan","B. Raja","C. Adipati","D. Patih"], jawaban: "A", explain: "Keraton Yogyakarta dipimpin oleh Sultan Hamengkubuwono." },
  { soal: "Gunung tertinggi di Pulau Jawa adalah?", opsi: ["A. Gunung Merapi","B. Gunung Slamet","C. Gunung Semeru","D. Gunung Lawu"], jawaban: "C", explain: "Gunung Semeru adalah gunung tertinggi di Pulau Jawa (3.676 mdpl)." },
  { soal: "Tarian sakral khas Keraton Surakarta adalah?", opsi: ["A. Tari Kecak","B. Tari Bedhaya","C. Tari Saman","D. Tari Pendet"], jawaban: "B", explain: "Tari Bedhaya adalah tarian sakral khas Keraton Surakarta." },
  { soal: "Provinsi paling timur di Pulau Jawa adalah?", opsi: ["A. Jawa Tengah","B. Jawa Barat","C. Jawa Timur","D. Banten"], jawaban: "C", explain: "Jawa Timur adalah provinsi paling timur di Pulau Jawa." },
  { soal: "Suku asli yang mendiami wilayah Jawa Barat adalah?", opsi: ["A. Suku Jawa","B. Suku Sunda","C. Suku Betawi","D. Suku Madura"], jawaban: "B", explain: "Suku Sunda mendiami wilayah Jawa Barat." },
  { soal: "Sungai terpanjang di Pulau Jawa adalah?", opsi: ["A. Bengawan Solo","B. Citarum","C. Brantas","D. Serayu"], jawaban: "A", explain: "Bengawan Solo adalah sungai terpanjang di Pulau Jawa." },
  { soal: "Kerajaan Islam pertama di Pulau Jawa adalah?", opsi: ["A. Mataram Islam","B. Banten","C. Demak","D. Cirebon"], jawaban: "C", explain: "Kesultanan Demak dianggap sebagai kerajaan Islam pertama di Jawa." },
  { soal: "Kain tenun bercorak garis khas Jawa (selain batik) disebut?", opsi: ["A. Songket","B. Tenun Ikat","C. Lurik","D. Ulos"], jawaban: "C", explain: "Lurik adalah kain tenun bercorak garis khas Jawa." },
  { soal: "Sebutan untuk rumah adat tradisional Jawa adalah?", opsi: ["A. Rumah Gadang","B. Rumah Joglo","C. Rumah Tongkonan","D. Rumah Panggung"], jawaban: "B", explain: "Joglo adalah nama rumah adat tradisional Jawa." },
  { soal: "Kota terbesar kedua di Pulau Jawa setelah Jakarta adalah?", opsi: ["A. Bandung","B. Surabaya","C. Semarang","D. Malang"], jawaban: "B", explain: "Surabaya adalah kota terbesar kedua di Pulau Jawa dan ibukota Jawa Timur." },
];

// ═════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mention  = (jid) => `@${jid.split("@")[0]}`;
const randomPercent = () => rand(10, 100);

// ─── Reward saldo random untuk game tebak-tebakan & kuis ────────────
// Minimal Rp 10.000, dibulatkan ke kelipatan Rp 1.000 biar rapi.
function randomReward(minRb = 10, maxRb = 50) {
  return rand(minRb, maxRb) * 1000;
}

// ─── Cek apakah pengirim adalah owner bot ──────────────────
// WhatsApp sekarang kadang mengirim ID internal "@lid" (Linked ID)
// sebagai pengganti nomor telepon asli demi privasi. Fungsi ini cek
// nomor biasa DULU, lalu fallback ke senderPn/participantPn (nomor asli
// yang kadang disertakan Baileys di balik LID), dan terakhir fallback
// ke LID yang sudah disimpan manual di global.ownerLid.
function isOwner(sender, msg) {
  const senderNumber = sender.split("@")[0].split(":")[0];
  if (senderNumber === global.ownernumber) return true;

  const pn = msg?.key?.senderPn || msg?.key?.participantPn;
  if (pn) {
    const pnNumber = pn.split("@")[0].split(":")[0];
    if (pnNumber === global.ownernumber) return true;
  }

  if (sender.endsWith("@lid") && global.ownerLid && senderNumber === global.ownerLid) {
    return true;
  }

  return false;
}

// ─── BLACKLIST ──────────────────────────────────────────────
// Simpan in-memory (hilang kalau bot restart, sama seperti saldo).
// Key disimpan tanpa "@..." biar cocok baik untuk JID nomor biasa
// maupun JID berbasis LID.
global.blacklist = global.blacklist || {};

function keyFromJid(jidOrNumber) {
  if (jidOrNumber.includes("@")) return jidOrNumber.split("@")[0].split(":")[0];
  return jidOrNumber.replace(/[^0-9]/g, "");
}
function addBlacklist(jidOrNumber) {
  global.blacklist[keyFromJid(jidOrNumber)] = true;
}
function removeBlacklist(jidOrNumber) {
  delete global.blacklist[keyFromJid(jidOrNumber)];
}
function isBlacklisted(sender, msg) {
  const senderNumber = sender.split("@")[0].split(":")[0];
  if (global.blacklist[senderNumber]) return true;

  const pn = msg?.key?.senderPn || msg?.key?.participantPn;
  if (pn) {
    const pnNumber = pn.split("@")[0].split(":")[0];
    if (global.blacklist[pnNumber]) return true;
  }
  return false;
}

// ─── Anti-soal-berulang ────────────────────────────────────
const lastSoalIndex = {};
function getRandomNoRepeat(arr, jid, kategori) {
  if (!lastSoalIndex[jid]) lastSoalIndex[jid] = {};
  const lastIdx = lastSoalIndex[jid][kategori];

  let idx = Math.floor(Math.random() * arr.length);
  if (arr.length > 1) {
    let tries = 0;
    while (idx === lastIdx && tries < 10) {
      idx = Math.floor(Math.random() * arr.length);
      tries++;
    }
  }

  lastSoalIndex[jid][kategori] = idx;
  return arr[idx];
}

async function reply(sock, msg, text, mentions) {
  const payload = { text };
  if (mentions && mentions.length) payload.mentions = mentions;
  await sock.sendMessage(msg.key.remoteJid, payload, { quoted: msg });
}

async function replyImage(sock, msg, imageUrl, caption, mentions) {
  try {
    const res = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(res.data);
    const payload = { image: buffer, caption, mimetype: "image/jpeg" };
    if (mentions && mentions.length) payload.mentions = mentions;
    await sock.sendMessage(msg.key.remoteJid, payload, { quoted: msg });
  } catch {
    await reply(sock, msg, caption, mentions);
  }
}

// ─── Ambil buffer dari URL ─────────────────────────────────
async function getBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("getBuffer error:", e.message);
    return null;
  }
}

// ─── React emoji ke pesan ──────────────────────────────────
function makeReact(sock, msg) {
  return async function react(emoji) {
    try {
      await sock.sendMessage(msg.key.remoteJid, {
        react: { text: emoji, key: msg.key },
      });
    } catch {}
  };
}

// ─── React bergilir sebelum menu ditampilkan ───────────────
const MENU_REACT_EMOJIS = ["😀", "😃", "😄", "😁", "🔥"];
async function reactMenuBergilir(sock, msg, delayMs = 350) {
  const react = makeReact(sock, msg);
  for (const emoji of MENU_REACT_EMOJIS) {
    await react(emoji);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// ─── Indikator "sedang proses" ──────────────────────────────
function makeReplyWait(sock, jid, msg) {
  return async function replyWait() {
    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch {}
    try {
      await sock.sendMessage(
        jid,
        { text: "⏳ Sebentar ya ganteng, permintaan mu sedang saya proses" },
        msg ? { quoted: msg } : undefined
      );
    } catch {}
  };
}

// ─── Preview channel kecil di contextInfo (opsional, dekorasi) ──
function getChannelPreview(title, body) {
  return {
    forwardingScore: 1,
    isForwarded: true,
    externalAdReply: {
      title: title || global.namabot,
      body: body || "",
      mediaType: 1,
      thumbnailUrl: global.menuImage,
      renderLargerThumbnail: false,
      showAdAttribution: false,
    },
  };
}

// ─── Download media dari pesan (gambar/video) ──────────────
async function downloadMedia(mediaMsg, mediaType) {
  const stream = await downloadContentFromMessage(mediaMsg, mediaType);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// ═════════════════════════════════════════════════════════
//  STICKER ENGINE — ffmpeg + node-webpmux (TANPA sharp)
// ═════════════════════════════════════════════════════════

const STICKER_TMP_DIR = path.join(os.tmpdir(), "sticker-tmp");
if (!fs.existsSync(STICKER_TMP_DIR)) fs.mkdirSync(STICKER_TMP_DIR, { recursive: true });

// Jalankan ffmpeg sebagai child process (binary sistem, dipasang lewat
// "pkg install ffmpeg" di Termux). Tidak butuh native module Node sama
// sekali, jadi aman dari masalah "prebuilt binaries not available".
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject); // contoh: ffmpeg belum terinstall
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Convert buffer gambar/video jadi webp 512x512 (statis atau animasi).
async function bufferToWebp(buffer, isVideo) {
  const id = `${Date.now()}_${rand(1000, 9999)}`;
  const inputPath  = path.join(STICKER_TMP_DIR, `${id}.in`);
  const outputPath = path.join(STICKER_TMP_DIR, `${id}.webp`);
  fs.writeFileSync(inputPath, buffer);

  try {
    if (isVideo) {
      await runFfmpeg([
        "-y", "-i", inputPath,
        "-vcodec", "libwebp",
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:-1:-1:color=#00000000",
        "-loop", "0",
        "-preset", "default",
        "-an", "-vsync", "0",
        "-t", "10", // batasi max 10 detik biar ukuran sticker wajar
        outputPath,
      ]);
    } else {
      await runFfmpeg([
        "-y", "-i", inputPath,
        "-vcodec", "libwebp",
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=#00000000",
        "-lossless", "1",
        "-qscale", "75",
        outputPath,
      ]);
    }
    return fs.readFileSync(outputPath);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

// Tulis metadata sticker-pack-name & sticker-pack-publisher ke EXIF
// webp memakai node-webpmux (pure JS, tidak ada native build).
async function addStickerMetadata(webpBuffer) {
  const img = new WebP.Image();
  await img.load(webpBuffer);

  const packId = `com.${(global.stickerPack || "bot").toString().toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const json = {
    "sticker-pack-id": packId,
    "sticker-pack-name": global.stickerPack,
    "sticker-pack-publisher": global.stickerAuthor,
    emojis: ["🤖"],
  };
  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf-8");
  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  exifHeader.writeUIntLE(jsonBuffer.length, 14, 4);

  img.exif = Buffer.concat([exifHeader, jsonBuffer]);
  return img.save(null);
}

// Pengganti langsung dari fungsi lama yang dulu pakai wa-sticker-formatter/sharp.
async function convertToSticker(buffer, isVideo) {
  const webpBuffer = await bufferToWebp(buffer, isVideo);
  return addStickerMetadata(webpBuffer);
}

async function convertGifToSticker(buffer) {
  return convertToSticker(buffer, true);
}

// ─── Hidetag helper ────────────────────────────────────────
async function getGroupMentions(sock, jid) {
  if (!jid.endsWith("@g.us")) return [];
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.map((p) => p.id);
  } catch {
    return [];
  }
}

// ─── Resolve target untuk command "cek-cekan" ─────────────
function resolveTarget(msg, text, sender) {
  const mentionedJid =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (mentionedJid) {
    return { isTag: true, jid: mentionedJid, label: mention(mentionedJid) };
  }

  const args = text.trim().split(/\s+/).slice(1).join(" ").trim();
  if (args) {
    return { isTag: false, jid: null, label: args };
  }

  return null;
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — GAME
// ═════════════════════════════════════════════════════════

async function handleTebakBendera(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.tebakBendera) return reply(sock, msg, `⚠️ Game masih berjalan!\n\n${state.tebakBendera.emoji}\n\nTebak dulu atau ketik *.skip_bendera*`);
  const soal = getRandomNoRepeat(BENDERA_DATA, jid, "bendera");
  state.tebakBendera = { ...soal, startedBy: sender };
  reply(sock, msg, `🏳️ *TEBAK BENDERA*\n\n${soal.emoji}\n\nNegara apa ini?\n💡 *.hint_bendera* | ⏭️ *.skip_bendera*`);
}

async function handleTebakKata(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.tebakKata) return reply(sock, msg, `⚠️ Game masih berjalan!\n\n📝 ${state.tebakKata.soal}\n\nKetik *.skip_kata* untuk skip`);
  const soal = getRandomNoRepeat(TEBAK_KATA_DATA, jid, "kata");
  state.tebakKata = { ...soal, startedBy: sender };
  reply(sock, msg, `🔤 *TEBAK KATA*\n\n📝 ${soal.soal}\n\n💡 *.hint_kata* | ⏭️ *.skip_kata*`);
}

async function handleKuis(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.kuis) {
    const k = state.kuis;
    return reply(sock, msg, `⚠️ Kuis masih berjalan!\n\n❓ ${k.soal}\n${k.opsi.join("\n")}\n\nJawab A/B/C/D`);
  }
  const soal = getRandomNoRepeat(KUIS_DATA, jid, "kuis");
  state.kuis = { ...soal, startedBy: sender };
  reply(sock, msg, `📚 *KUIS UMUM*\n\n❓ ${soal.soal}\n\n${soal.opsi.join("\n")}\n\n✏️ Jawab: A / B / C / D\n⏭️ *.skip_kuis*`);
}

function generateMath() {
  const ops = ["+", "-", "*"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, jawaban;
  if (op === "+") { a = rand(10,200); b = rand(10,200); jawaban = a+b; }
  else if (op === "-") { a = rand(50,300); b = rand(10,a); jawaban = a-b; }
  else { a = rand(2,25); b = rand(2,25); jawaban = a*b; }
  return { soal: `Berapa *${a} ${op} ${b}*?`, jawaban: jawaban.toString() };
}

async function handleKuisMath(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.kuisMath) return reply(sock, msg, `⚠️ Kuis math masih berjalan!\n\n🔢 ${state.kuisMath.soal}\n\n⏭️ *.skip_math*`);
  const soal = generateMath();
  state.kuisMath = { ...soal, startedBy: sender };
  reply(sock, msg, `🔢 *KUIS MATH*\n\n${soal.soal}\n\n✏️ Ketik jawabannya!\n⏭️ *.skip_math*`);
}

async function handleKuisEnglish(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.kuisEnglish) return reply(sock, msg, `⚠️ Kuis English masih berjalan!\n\n🇬🇧 ${state.kuisEnglish.soal}\n\n⏭️ *.skip_english*`);
  const soal = getRandomNoRepeat(ENGLISH_DATA, jid, "english");
  state.kuisEnglish = { ...soal, startedBy: sender };
  reply(sock, msg, `🇬🇧 *KUIS ENGLISH*\n\n❓ ${soal.soal}\n\n💡 *.hint_english* | ⏭️ *.skip_english*`);
}

async function handleKuisJava(sock, msg, jid, sender) {
  const state = getState(jid);
  if (state.kuisJava) {
    const k = state.kuisJava;
    return reply(sock, msg, `⚠️ Kuis Jawa masih berjalan!\n\n❓ ${k.soal}\n${k.opsi.join("\n")}\n\nJawab A/B/C/D`);
  }
  const soal = getRandomNoRepeat(KUISJAVA_DATA, jid, "java");
  state.kuisJava = { ...soal, startedBy: sender };
  reply(sock, msg, `🏯 *KUIS JAWA*\n\n❓ ${soal.soal}\n\n${soal.opsi.join("\n")}\n\n✏️ Jawab: A / B / C / D\n⏭️ *.skip_java*`);
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — CEK-CEKAN
// ═════════════════════════════════════════════════════════

async function handleCekTT(sock, msg, jid, sender, text) {
  const target = resolveTarget(msg, text, sender);
  if (!target) return reply(sock, msg, "🎭 *CEK TT*\n\nFormat:\n• Tag orangnya: *.cektt @nomor*\n• Atau ketik nama: *.cektt NamaOrang*");

  const namaTampil = target.isTag ? target.label : `*${target.label}*`;
  const p = randomPercent();
  const lvl = p>=81?"🔥 Super Menarik!":p>=61?"😍 Cukup Menawan":p>=41?"🙂 Lumayan":p>=21?"😐 Biasa Aja":"❌ Kurang Menarik";
  const teks = `🎭 *CEK TT*\n\n👤 Target: ${namaTampil}\n📊 Skor: *${p}%*\n${bar(p)}\n🏷️ ${lvl}\n\n_Hanya untuk fun! 😄_`;
  reply(sock, msg, teks, target.isTag ? [target.jid] : []);
}

async function handleCekGanteng(sock, msg, jid, sender, text) {
  const target = resolveTarget(msg, text, sender);
  if (!target) return reply(sock, msg, "😎 *CEK GANTENG*\n\nFormat:\n• Tag orangnya: *.cekganteng @nomor*\n• Atau ketik nama: *.cekganteng NamaOrang*");

  const namaTampil = target.isTag ? target.label : `*${target.label}*`;
  const p = randomPercent();
  const kata = p>=50
    ? getRandom(["Ganteng level sultan 👑","Literally jadi pemeran utama drama Korea! 🌟","Good looking parah, bahaya buat cewek 😅","Gantengnya bikin noleh dua kali! 😍"])
    : getRandom(["Cermin bilang: 'buka kacamata dulu bro' 😂","Level ganteng: masih loading... ⏳","Gantengnya tersembunyi, perlu dikeluarkan dulu 🤔"]);
  const teks = `😎 *CEK GANTENG*\n\n👤 Target: ${namaTampil}\n📊 ${p}%\n${bar(p)}\n💬 ${kata}\n\n_Hanya fun! 😁_`;
  reply(sock, msg, teks, target.isTag ? [target.jid] : []);
}

async function handleCekCantik(sock, msg, jid, sender, text) {
  const target = resolveTarget(msg, text, sender);
  if (!target) return reply(sock, msg, "💄 *CEK CANTIK*\n\nFormat:\n• Tag orangnya: *.cekcantik @nomor*\n• Atau ketik nama: *.cekcantik NamaOrang*");

  const namaTampil = target.isTag ? target.label : `*${target.label}*`;
  const p = randomPercent();
  const kata = getRandom(["Natural cantiknya, tanpa filter pun bersinar 🌸","Senyummu bikin hati meleleh 💕","Kalau selfie pasti viral di TikTok! 📱🔥","Cantiknya bikin orang noleh dua kali! 😍"]);
  const teks = `💄 *CEK CANTIK*\n\n👤 Target: ${namaTampil}\n📊 ${p}%\n${bar(p)}\n💬 ${kata}\n\n_Hanya fun! 😘_`;
  reply(sock, msg, teks, target.isTag ? [target.jid] : []);
}

async function handleCekSaldo(sock, msg, jid, sender) {
  const saldo = rand(1000, 999999999);
  const bank  = getRandom(["BCA","BNI","Mandiri","BRI","CIMB","GoPay","OVO","Dana"]);
  const status= saldo>50000000?"💎 Sultan!":saldo>5000000?"🙂 Cukup":"😅 Nabung dulu yuk";
  reply(sock, msg, `💰 *CEK SALDO*\n\n👤 ${mention(sender)}\n🏦 Bank: *${bank}*\n💵 Saldo: *Rp ${saldo.toLocaleString("id-ID")}*\n📊 ${status}\n\n_❗ Bukan saldo asli! 😂_`, [sender]);
}

async function handleSaldoGame(sock, msg, jid, sender) {
  const user = getUser(sender);
  reply(sock, msg, `💰 *SALDO GAME*\n\n👤 ${mention(sender)}\n💵 Saldo: *Rp ${formatNumber(user.money)}*\n\n_Gunakan untuk main *.slot*_`, [sender]);
}

// ─── Tambah saldo — KHUSUS owner bot ───────────────────────
// Format: .tambahsaldo @tag jumlah   ATAU   .tambahsaldo 628xxx jumlah
async function handleTambahSaldo(sock, msg, jid, sender, args, mentionedJid) {
  if (!isOwner(sender, msg)) {
    return reply(sock, msg, "❌ Fitur ini khusus owner bot!");
  }

  let targetJid = mentionedJid?.[0] || null;
  let amount;

  if (targetJid) {
    amount = parseInt(args[args.length - 1]);
  } else if (args[0]) {
    const nomor = args[0].replace(/[^0-9]/g, "");
    if (!nomor) {
      return reply(sock, msg, `❌ Format salah!\nContoh:\n*${global.prefix}tambahsaldo @tag 50000*\n*${global.prefix}tambahsaldo 628xxxxxxxxxx 50000*`);
    }
    targetJid = `${nomor}@s.whatsapp.net`;
    amount = parseInt(args[1]);
  }

  if (!targetJid || !amount || isNaN(amount) || amount <= 0) {
    return reply(sock, msg, `❌ Format salah!\nContoh:\n*${global.prefix}tambahsaldo @tag 50000*\n*${global.prefix}tambahsaldo 628xxxxxxxxxx 50000*`);
  }

  const user = getUser(targetJid);
  user.money += amount;

  reply(sock, msg, `✅ *TAMBAH SALDO BERHASIL*\n\n👤 Target: ${mention(targetJid)}\n💰 Ditambahkan: *Rp ${formatNumber(amount)}*\n💵 Saldo sekarang: *Rp ${formatNumber(user.money)}*`, [targetJid]);
}

// ─── Blacklist — KHUSUS owner bot ──────────────────────────
// Format: .blacklist @tag   ATAU   .blacklist 628xxx
//         .unblacklist @tag ATAU   .unblacklist 628xxx
async function handleBlacklist(sock, msg, jid, sender, args, mentionedJid, remove) {
  if (!isOwner(sender, msg)) {
    return reply(sock, msg, "❌ Fitur ini khusus owner bot!");
  }

  let targetJid = mentionedJid?.[0] || null;
  if (!targetJid && args[0]) {
    const nomor = args[0].replace(/[^0-9]/g, "");
    if (nomor) targetJid = `${nomor}@s.whatsapp.net`;
  }
  if (!targetJid) {
    return reply(sock, msg, `❌ Format salah!\nContoh:\n*${global.prefix}${remove ? "unblacklist" : "blacklist"} @tag*\n*${global.prefix}${remove ? "unblacklist" : "blacklist"} 628xxxxxxxxxx*`);
  }

  const targetNumber = keyFromJid(targetJid);
  if (targetNumber === global.ownernumber || targetNumber === global.ownerLid) {
    return reply(sock, msg, "❌ Tidak bisa blacklist owner sendiri!");
  }

  if (remove) {
    removeBlacklist(targetJid);
    return reply(sock, msg, `✅ ${mention(targetJid)} dikeluarkan dari blacklist.\nUser ini sudah bisa pakai fitur bot lagi.`, [targetJid]);
  }

  addBlacklist(targetJid);
  reply(sock, msg, `🚫 *USER DI-BLACKLIST*\n\n👤 ${mention(targetJid)}\nUser ini sekarang tidak bisa pakai fitur bot sama sekali.`, [targetJid]);
}

async function handleCekJodoh(sock, msg, jid, sender, text) {
  const target = resolveTarget(msg, text, sender);
  if (!target) return reply(sock, msg, "❤️ *CEK JODOH*\n\nFormat:\n• Tag orangnya: *.cekjodoh @nomor*\n• Atau ketik nama: *.cekjodoh NamaPasangan*");

  const namaTampil = target.isTag ? target.label : `*${target.label}*`;
  const p = randomPercent();
  const status = p>=80?"💍 JODOH BANGET!":p>=60?"💕 Cocok banget!":p>=40?"🙂 Lumayan cocok":p>=20?"😐 Kurang cocok":"💔 Bukan jodohnya";
  const teks = `❤️ *CEK JODOH*\n\n👦 ${mention(sender)}\n💞 +\n👧 ${namaTampil}\n\n📊 Kecocokan: *${p}%*\n${bar(p)}\n💬 ${status}\n\n_Hanya fun! 💝_`;
  const mentions = target.isTag ? [sender, target.jid] : [sender];
  reply(sock, msg, teks, mentions);
}

async function handleCekIQ(sock, msg, jid, sender) {
  const iq = rand(50,180);
  const lvl = iq>=160?"🧠 GENIUS! Einstein reinkarnasi!":iq>=130?"🌟 Super Cerdas!":iq>=110?"📚 Di atas rata-rata":iq>=90?"😊 Rata-rata":iq>=70?"😅 Perlu belajar lebih":"🦆 Masih ada harapan!";
  reply(sock, msg, `🧠 *CEK IQ*\n\n👤 ${mention(sender)}\n📊 IQ: *${iq}*\n🏷️ ${lvl}\n\n_Hanya fun! 😄_`, [sender]);
}

async function handleCekNasib(sock, msg, jid, sender) {
  const list = ["🌟 Rezeki nomplok hari ini!","💕 Ada yang diam-diam suka kamu!","🎯 Targetmu akan tercapai!","☕ Coba hal baru hari ini!","😴 Jangan begadang malam ini","🚀 Potensimu sangat besar hari ini!","🍀 Keberuntungan berpihak padamu!","⚠️ Hati-hati dalam berbicara","💪 Hari keras, tapi kamu bisa!"];
  const bintang = rand(1,5);
  reply(sock, msg, `🔮 *CEK NASIB*\n\n👤 ${mention(sender)}\n${"⭐".repeat(bintang)}${"☆".repeat(5-bintang)}\n\n💬 ${getRandom(list)}\n\n_Hanya ramalan fun! 😄_`, [sender]);
}

async function handleCekHoki(sock, msg, jid, sender, text) {
  const target = resolveTarget(msg, text, sender);
  if (!target) return reply(sock, msg, "🍀 *CEK HOKI*\n\nFormat:\n• Tag orangnya: *.cekhoki @nomor*\n• Atau ketik nama: *.cekhoki NamaOrang*");

  const namaTampil = target.isTag ? target.label : `*${target.label}*`;
  const p = randomPercent();
  const color = getRandom(["🔴 Merah","🔵 Biru","🟡 Kuning","🟢 Hijau","🟣 Ungu","🟠 Oranye"]);
  const teks = `🍀 *CEK HOKI*\n\n👤 Target: ${namaTampil}\n📊 Hoki: *${p}%*\n${bar(p)}\n🎨 Warna Hoki: *${color}*\n🔢 Angka Hoki: *${rand(1,100)}*\n\n_Semoga harimu menyenangkan! 😊_`;
  reply(sock, msg, teks, target.isTag ? [target.jid] : []);
}

async function handleCekBoty(sock, msg, jid, sender) {
  const sifat = getRandom(["Running on love.exe 💕","CPU overload mikirin kamu 💻😂","Error 404: Perasaan not found 🤣","Sudah diprogram jadi bot terbaik! 🌟"]);
  reply(sock, msg, `🤖 *CEK BOTY*\n\n🔧 Nama: *${global.namabot}*\n📌 Versi: *${global.version}*\n⚡ Status: *Online!*\n🧠 IQ Bot: *${rand(100,999)}*\n\n💬 _"${sifat}"_`);
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — SLOT MACHINE
// ═════════════════════════════════════════════════════════

async function handleSlot(sock, msg, jid, sender, args) {
  const user = getUser(sender);
  const betAmount = parseInt(args[0]);

  if (!args[0] || isNaN(betAmount) || betAmount <= 0) {
    return reply(sock, msg, `🎰 *SLOT MACHINE*\n\nFormat: *${global.prefix}slot [jumlah taruhan]*\nContoh: *${global.prefix}slot 1000*\n\n💰 Saldo kamu: Rp ${formatNumber(user.money)}`);
  }
  if (user.money < betAmount) {
    return reply(sock, msg, `❌ Saldo tidak cukup!\n\n💰 Saldo kamu: Rp ${formatNumber(user.money)}`);
  }

  try {
    const symbols = ["🎰", "🍒", "7️⃣", "💰", "💎"];
    user.money -= betAmount;

    const isWin = Math.random() < global.slotWinRate;

    let spins;
    if (isWin) {
      const winSymbol = getRandom(symbols);
      spins = Array.from({ length: 9 }, () => getRandom(symbols));
      spins[3] = winSymbol; spins[4] = winSymbol; spins[5] = winSymbol;
    } else {
      spins = Array.from({ length: 9 }, () => getRandom(symbols));
      while (spins[3] === spins[4] && spins[4] === spins[5]) {
        spins[5] = getRandom(symbols);
      }
    }

    const reward = isWin ? betAmount * 3 : 0;
    user.money += reward;

    const resText = `*🎰 VIRTUAL SLOTS 🎰*\n\n` +
      `${spins.slice(0, 3).join(" | ")}\n` +
      `${spins.slice(3, 6).join(" | ")} ◀ RESULT\n` +
      `${spins.slice(6).join(" | ")}\n\n` +
      `*${isWin ? "🥳 JACKPOT! Menang Rp " + formatNumber(reward) : "🥶 KALAH! Lebih beruntung lagi ya~"}*\n` +
      `💰 Saldo kamu: Rp ${formatNumber(user.money)}`;

    reply(sock, msg, resText);
  } catch (e) {
    console.error("Slot error:", e);
  }
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — SUIT PVP (BATU GUNTING KERTAS)
// ═════════════════════════════════════════════════════════

global.suit = global.suit || {};

function suitMenang(a, b) {
  if (a === b) return null;
  const aturan = { batu: "gunting", gunting: "kertas", kertas: "batu" };
  return aturan[a] === b ? "p1" : "p2";
}

async function handleSuitPvp(sock, msg, jid, sender, mentionedJid) {
  const who = mentionedJid?.[0] || null;
  if (!who) return reply(sock, msg, `❌ Tag orang yang ingin ditantang!\nContoh: ${global.prefix}suitpvp @nama`);
  if (who === sender) return reply(sock, msg, "❌ Tidak bisa menantang diri sendiri!");

  const id = "suit_" + Date.now();
  global.suit[id] = {
    id,
    p: sender,
    p2: who,
    status: "wait",
    asal: jid,
    pilih: null,
    pilih2: null,
    waktu: setTimeout(() => {
      delete global.suit[id];
      sock.sendMessage(jid, {
        text: `⏰ Waktu suit antara ${mention(sender)} dan ${mention(who)} habis!`,
        mentions: [sender, who],
      }).catch(() => {});
    }, 60000),
  };

  await sock.sendMessage(jid, {
    text: `🎮 ${mention(sender)} menantang ${mention(who)} main suit!\n\nKetik *terima* atau *gas* untuk mulai bermain!\n_(Timeout: 60 detik)_`,
    mentions: [sender, who],
  }, { quoted: msg });
}

async function checkSuitFlow(sock, msg, jid, sender, text) {
  const lower = text.toLowerCase().trim();

  const sesi = Object.values(global.suit).find(
    (s) => s.asal === jid && (s.p === sender || s.p2 === sender)
  );
  if (!sesi) return false;

  if (sesi.status === "wait") {
    if (sender !== sesi.p2) return false;
    if (lower === "terima" || lower === "gas") {
      sesi.status = "playing";
      await reply(sock, msg, `✅ ${mention(sesi.p2)} menerima tantangan!\n\nKirim pilihan kalian via chat pribadi ke bot, atau ketik *batu* / *gunting* / *kertas* di sini.`, [sesi.p, sesi.p2]);
      return true;
    }
    return false;
  }

  if (sesi.status === "playing") {
    const pilihanValid = ["batu", "gunting", "kertas"];
    if (!pilihanValid.includes(lower)) return false;

    if (sender === sesi.p && !sesi.pilih) sesi.pilih = lower;
    else if (sender === sesi.p2 && !sesi.pilih2) sesi.pilih2 = lower;
    else return false;

    if (sesi.pilih && sesi.pilih2) {
      clearTimeout(sesi.waktu);
      const hasil = suitMenang(sesi.pilih, sesi.pilih2);
      let teksHasil;
      if (!hasil) teksHasil = `🤝 SERI! Sama-sama pilih *${sesi.pilih}*`;
      else if (hasil === "p1") teksHasil = `🏆 ${mention(sesi.p)} MENANG! (*${sesi.pilih}* vs *${sesi.pilih2}*)`;
      else teksHasil = `🏆 ${mention(sesi.p2)} MENANG! (*${sesi.pilih2}* vs *${sesi.pilih}*)`;

      delete global.suit[sesi.id];
      await reply(sock, msg, `🎮 *HASIL SUIT*\n\n${teksHasil}`, [sesi.p, sesi.p2]);
    } else {
      await reply(sock, msg, `✅ Pilihan ${mention(sender)} diterima! Menunggu lawan...`, [sender]);
    }
    return true;
  }

  return false;
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — STICKER & MEME
// ═════════════════════════════════════════════════════════

async function handleBrat(sock, msg, jid, text, hd) {
  if (!text) return reply(sock, msg, `Contoh: ${global.prefix}${hd ? "brathd" : "brat"} halo dunia`);
  const react = makeReact(sock, msg);
  try {
    await makeReplyWait(sock, jid, msg)();
    await react("🕒");
    const url = hd
      ? `https://api-faa.my.id/faa/brathd?text=${encodeURIComponent(text)}`
      : `https://aqul-brat.hf.space?text=${encodeURIComponent(text)}`;
    const rawBuffer = await getBuffer(url);
    if (!rawBuffer) throw new Error("Buffer kosong");
    const stickerBuffer = await convertToSticker(rawBuffer, false);
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    await react("✅");
  } catch (e) {
    console.error("Brat error:", e);
    await react("❌");
    await reply(sock, msg, `❌ Gagal buat stiker brat${hd ? " HD" : ""}.`);
  }
}

async function handleBratVid(sock, msg, jid, text) {
  if (!text) return reply(sock, msg, `✨ Masukin teks dong!\nContoh: ${global.prefix}bratvid halo dunia`);
  const react = makeReact(sock, msg);
  try {
    await makeReplyWait(sock, jid, msg)();
    await react("🕒");
    const rawBuffer = await getBuffer(`https://brat.siputzx.my.id/gif?text=${encodeURIComponent(text)}`);
    if (!rawBuffer) throw new Error("Buffer kosong");
    const stickerBuffer = await convertGifToSticker(rawBuffer);
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    await react("✅");
  } catch (e) {
    console.error("Bratvid error:", e);
    await react("❌");
    await reply(sock, msg, "❌ Gagal buat stiker bratvid.");
  }
}

function findMediaInfo(msg) {
  const msgType = Object.keys(msg.message || {}).find((k) => k === "imageMessage" || k === "videoMessage");
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedType = quoted && Object.keys(quoted).find((k) => k === "imageMessage" || k === "videoMessage");

  if (msgType) {
    return { mediaMsg: msg.message[msgType], type: msgType.replace("Message", ""), isVideo: msgType === "videoMessage" };
  }
  if (quotedType) {
    return { mediaMsg: quoted[quotedType], type: quotedType.replace("Message", ""), isVideo: quotedType === "videoMessage" };
  }
  return null;
}

async function handleSticker(sock, msg, jid) {
  const info = findMediaInfo(msg);
  if (!info) {
    return reply(sock, msg, `❌ Balas foto atau video dengan teks *${global.prefix}s*\nContoh: Reply foto lalu ketik *${global.prefix}s*`);
  }
  const react = makeReact(sock, msg);
  try {
    await makeReplyWait(sock, jid, msg)();
    await react("🕒");
    const rawBuffer = await downloadMedia(info.mediaMsg, info.type);
    const stickerBuffer = await convertToSticker(rawBuffer, info.isVideo);
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    await react("✅");
  } catch (e) {
    console.error("Sticker error:", e);
    await react("❌");
    await reply(sock, msg, "❌ Gagal membuat stiker.");
  }
}

// ─── Upload gambar sementara ke catbox.moe ─────────────────
async function uploadImageTemp(buffer, filename) {
  try {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, filename || `img_${Date.now()}.jpg`);
    const res = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });
    const url = (res.data || "").toString().trim();
    return url.startsWith("http") ? url : null;
  } catch (e) {
    console.error("uploadImageTemp error:", e.message);
    return null;
  }
}

async function handleSmeme(sock, msg, jid, text) {
  const info = findMediaInfo(msg);
  if (!info || info.isVideo) {
    return reply(sock, msg, `❌ *Cara pakai ${global.prefix}smeme:*\nReply atau kirim gambar dengan caption:\n*${global.prefix}smeme teks atas | teks bawah*\n\nContoh:\n*${global.prefix}smeme Ketika deadline | Tapi malah tidur*`);
  }

  const parts = (text || "").split("|");
  const topText = parts[0]?.trim() || "";
  const bottomText = parts[1]?.trim() || "";
  if (!topText && !bottomText) {
    return reply(sock, msg, `❌ Masukkan teks meme!\nContoh: *${global.prefix}smeme Teks atas | Teks bawah*`);
  }

  const react = makeReact(sock, msg);
  try {
    await makeReplyWait(sock, jid, msg)();
    await react("🕒");

    const imgBuffer = await downloadMedia(info.mediaMsg, info.type);
    const imgUrl = await uploadImageTemp(imgBuffer, `meme_${Date.now()}.jpg`);
    if (!imgUrl) return reply(sock, msg, "❌ Gagal upload gambar.");

    const memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(topText || "_")}/${encodeURIComponent(bottomText || "_")}.jpg?background=${encodeURIComponent(imgUrl)}`;
    const memeBuffer = await getBuffer(memeUrl);

    if (!memeBuffer) return reply(sock, msg, "❌ Gagal membuat meme.");

    await sock.sendMessage(jid, { image: memeBuffer, caption: "🎭 *Meme berhasil dibuat!*" }, { quoted: msg });
    await react("✅");
  } catch (e) {
    console.error("Smeme error:", e);
    await react("❌");
    await reply(sock, msg, "❌ Gagal membuat meme, coba lagi.");
  }
}

// ─── Progress bar helper ──────────────────────────────────
function bar(persen) {
  const fill = Math.round(persen / 10);
  return `${"🟩".repeat(fill)}${"⬜".repeat(10 - fill)} ${persen}%`;
}

// ═════════════════════════════════════════════════════════
//  HANDLERS — HINT & SKIP
// ═════════════════════════════════════════════════════════

async function handleHintBendera(sock, msg, jid) {
  const s = getState(jid);
  if (!s.tebakBendera) return reply(sock, msg, "❗ Tidak ada game Tebak Bendera. Ketik *.tebakbendera*");
  reply(sock, msg, `💡 Hint: ${s.tebakBendera.hint}\n\n${s.tebakBendera.emoji}`);
}
async function handleHintKata(sock, msg, jid) {
  const s = getState(jid);
  if (!s.tebakKata) return reply(sock, msg, "❗ Tidak ada game Tebak Kata. Ketik *.tebakkata*");
  reply(sock, msg, `💡 Hint: ${s.tebakKata.hint}`);
}
async function handleHintEnglish(sock, msg, jid) {
  const s = getState(jid);
  if (!s.kuisEnglish) return reply(sock, msg, "❗ Tidak ada Kuis English. Ketik *.kuisengglish*");
  reply(sock, msg, `💡 Hint: ${s.kuisEnglish.hint}`);
}
async function handleSkipBendera(sock, msg, jid) {
  const s = getState(jid);
  if (!s.tebakBendera) return reply(sock, msg, "❗ Tidak ada game Tebak Bendera.");
  const { jawaban, emoji } = s.tebakBendera; delete s.tebakBendera;
  reply(sock, msg, `⏭️ Skip!\n\n🏳️ Jawaban: *${jawaban[0].toUpperCase()}* ${emoji}`);
}
async function handleSkipKata(sock, msg, jid) {
  const s = getState(jid);
  if (!s.tebakKata) return reply(sock, msg, "❗ Tidak ada game Tebak Kata.");
  const { jawaban } = s.tebakKata; delete s.tebakKata;
  reply(sock, msg, `⏭️ Skip!\n\n🔤 Jawaban: *${jawaban.toUpperCase()}*`);
}
async function handleSkipKuis(sock, msg, jid) {
  const s = getState(jid);
  if (!s.kuis) return reply(sock, msg, "❗ Tidak ada Kuis yang berjalan.");
  const { jawaban, explain } = s.kuis; delete s.kuis;
  reply(sock, msg, `⏭️ Skip!\n\n✅ Jawaban: *${jawaban}*\n📖 ${explain}`);
}
async function handleSkipMath(sock, msg, jid) {
  const s = getState(jid);
  if (!s.kuisMath) return reply(sock, msg, "❗ Tidak ada Kuis Math.");
  const { jawaban } = s.kuisMath; delete s.kuisMath;
  reply(sock, msg, `⏭️ Skip!\n\n🔢 Jawaban: *${jawaban}*`);
}
async function handleSkipEnglish(sock, msg, jid) {
  const s = getState(jid);
  if (!s.kuisEnglish) return reply(sock, msg, "❗ Tidak ada Kuis English.");
  const { jawaban } = s.kuisEnglish; delete s.kuisEnglish;
  reply(sock, msg, `⏭️ Skip!\n\n🇬🇧 Jawaban: *${jawaban[0].toUpperCase()}*`);
}
async function handleSkipJava(sock, msg, jid) {
  const s = getState(jid);
  if (!s.kuisJava) return reply(sock, msg, "❗ Tidak ada Kuis Jawa yang berjalan.");
  const { jawaban, explain } = s.kuisJava; delete s.kuisJava;
  reply(sock, msg, `⏭️ Skip!\n\n✅ Jawaban: *${jawaban}*\n📖 ${explain}`);
}

// ═════════════════════════════════════════════════════════
//  CHECK ANSWERS
// ═════════════════════════════════════════════════════════

async function checkAnswers(sock, msg, jid, sender, text) {
  const s = getState(jid);
  const lower = text.toLowerCase().trim();

  if (s.tebakBendera && s.tebakBendera.jawaban.includes(lower)) {
    const { jawaban, emoji } = s.tebakBendera; delete s.tebakBendera;
    const reward = randomReward();
    const user = getUser(sender);
    user.money += reward;
    return reply(sock, msg, `🎉 *BENAR!*\n\n✅ ${mention(sender)} berhasil!\n🏳️ Jawaban: *${jawaban[0].toUpperCase()}* ${emoji}\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})\n\nKetik *.tebakbendera* untuk lanjut!`, [sender]);
  }
  if (s.tebakKata && lower === s.tebakKata.jawaban.toLowerCase()) {
    const { jawaban } = s.tebakKata; delete s.tebakKata;
    const reward = randomReward();
    const user = getUser(sender);
    user.money += reward;
    return reply(sock, msg, `🎉 *BENAR!*\n\n✅ ${mention(sender)} berhasil!\n🔤 Jawaban: *${jawaban.toUpperCase()}*\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})\n\nKetik *.tebakkata* untuk lanjut!`, [sender]);
  }
  if (s.kuis && ["a","b","c","d"].includes(lower)) {
    const benar = lower.toUpperCase() === s.kuis.jawaban;
    const { jawaban, explain } = s.kuis; delete s.kuis;
    if (benar) {
      const reward = randomReward();
      const user = getUser(sender);
      user.money += reward;
      return reply(sock, msg, `🎉 *BENAR!* ✅\n\n${mention(sender)} menjawab *${lower.toUpperCase()}*\n📖 ${explain}\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})`, [sender]);
    }
    return reply(sock, msg, `❌ *SALAH!*\n\n${mention(sender)} menjawab *${lower.toUpperCase()}*\n✅ Jawaban benar: *${jawaban}*\n📖 ${explain}`, [sender]);
  }
  if (s.kuisMath && lower === s.kuisMath.jawaban) {
    const { jawaban } = s.kuisMath; delete s.kuisMath;
    const reward = randomReward();
    const user = getUser(sender);
    user.money += reward;
    return reply(sock, msg, `🎉 *BENAR!* 🔢\n\n✅ ${mention(sender)} tepat!\nJawaban: *${jawaban}*\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})`, [sender]);
  }
  if (s.kuisEnglish && s.kuisEnglish.jawaban.includes(lower)) {
    const { jawaban } = s.kuisEnglish; delete s.kuisEnglish;
    const reward = randomReward();
    const user = getUser(sender);
    user.money += reward;
    return reply(sock, msg, `🎉 *BENAR!* 🇬🇧\n\n✅ ${mention(sender)} tepat!\nJawaban: *${jawaban[0].toUpperCase()}*\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})`, [sender]);
  }
  if (s.kuisJava && ["a","b","c","d"].includes(lower)) {
    const benar = lower.toUpperCase() === s.kuisJava.jawaban;
    const { jawaban, explain } = s.kuisJava; delete s.kuisJava;
    if (benar) {
      const reward = randomReward();
      const user = getUser(sender);
      user.money += reward;
      return reply(sock, msg, `🎉 *BENAR!* 🏯\n\n${mention(sender)} menjawab *${lower.toUpperCase()}*\n📖 ${explain}\n💰 +Rp ${formatNumber(reward)} (Saldo: Rp ${formatNumber(user.money)})`, [sender]);
    }
    return reply(sock, msg, `❌ *SALAH!*\n\n${mention(sender)} menjawab *${lower.toUpperCase()}*\n✅ Jawaban benar: *${jawaban}*\n📖 ${explain}`, [sender]);
  }
}

// ═════════════════════════════════════════════════════════
//  MENU
// ═════════════════════════════════════════════════════════

async function handleMenu(sock, msg, jid) {
  await reactMenuBergilir(sock, msg);

  const teksmenu =
`▲ Bot : *${global.namabot}* (v${global.version})
▲ Owner : *${global.ownername}*
▲ Mode : *${global.botMode ? "Public" : "Self"}*
▲ Runtime : *${runtime(process.uptime())}*

🏳️ *TEBAK-TEBAKAN*
.tebakbendera
.tebakkata
.hint_bendera
.hint_kata
.skip_bendera
.skip_kata

📚 *KUIS*
.kuis
.kuismath
.kuisengglish
.kuisjava
.hint_english
.skip_kuis
.skip_math
.skip_english
.skip_java

🔮 *CEK-CEKAN*
.cektt
.cekganteng
.cekcantik
.cekjodoh
.cekhoki
.ceksaldo
.cekiq
.ceknasib
.cekboty

🎰 *GAME RANDOM*
.slot [jumlah]
.saldo
.suitpvp @nama (khusus grup)

🛡️ *ADMIN*
.blacklist @tag/nomor (khusus owner)
.unblacklist @tag/nomor (khusus owner)
.tambahsaldo @tag/nomor jml (khusus owner)

🎨 *STICKER & MEME*
.s / .sticker
.brat [teks]
.brathd [teks]
.bratvid [teks]
.smeme teks atas | teks bawah

_Prefix: ${global.prefix}_ 🎉`;

  const mentions = await getGroupMentions(sock, jid);
  await replyImage(sock, msg, global.menuImage, teksmenu, mentions);
}

// ═════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ═════════════════════════════════════════════════════════

async function handleMessage(sock, msg) {
  try {
    if (!msg.message) return;
    const jid    = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const sender = msg.key.participant || msg.key.remoteJid;

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || "";

    if (!text) return;

    const lower = text.toLowerCase().trim();
    const isCmd = lower.startsWith(global.prefix);
    const args = text.trim().split(/\s+/).slice(1);
    const command = isCmd ? lower.slice(global.prefix.length).split(" ")[0] : "";

    if (!isCmd) {
      const handledBySuit = await checkSuitFlow(sock, msg, jid, sender, text);
      if (!handledBySuit) await checkAnswers(sock, msg, jid, sender, text);
      return;
    }

    if (isBlacklisted(sender, msg)) {
      return reply(sock, msg, "*_Upss kamu di blacklist sama owner ku,jika ingin di buka beliin owner ku mie ayam+esteh😅😁_*");
    }

    switch (command) {
      case "menu": case "help": case "start":
        await handleMenu(sock, msg, jid); break;

      case "myid":
        await reply(sock, msg, `🆔 *INFO ID*\n\nJID asli: ${sender}\nNomor terdeteksi: ${sender.split("@")[0].split(":")[0]}\nsenderPn/participantPn: ${msg?.key?.senderPn || msg?.key?.participantPn || "(tidak ada)"}\nOwner di config: ${global.ownernumber} (LID: ${global.ownerLid || "-"})\nDikenali sebagai owner? ${isOwner(sender, msg) ? "✅ YA" : "❌ TIDAK"}`);
        break;

      case "tebakbendera": await handleTebakBendera(sock, msg, jid, sender); break;
      case "tebakkata":    await handleTebakKata(sock, msg, jid, sender); break;

      case "kuis":         await handleKuis(sock, msg, jid, sender); break;
      case "kuismath":     await handleKuisMath(sock, msg, jid, sender); break;
      case "kuisengglish": case "kuisenglish":
        await handleKuisEnglish(sock, msg, jid, sender); break;
      case "kuisjava": await handleKuisJava(sock, msg, jid, sender); break;

      case "hint_bendera": await handleHintBendera(sock, msg, jid); break;
      case "hint_kata":    await handleHintKata(sock, msg, jid); break;
      case "hint_english": await handleHintEnglish(sock, msg, jid); break;

      case "skip_bendera": await handleSkipBendera(sock, msg, jid); break;
      case "skip_kata":    await handleSkipKata(sock, msg, jid); break;
      case "skip_kuis":    await handleSkipKuis(sock, msg, jid); break;
      case "skip_math":    await handleSkipMath(sock, msg, jid); break;
      case "skip_english": await handleSkipEnglish(sock, msg, jid); break;
      case "skip_java":    await handleSkipJava(sock, msg, jid); break;

      case "cektt":      await handleCekTT(sock, msg, jid, sender, text); break;
      case "cekganteng": await handleCekGanteng(sock, msg, jid, sender, text); break;
      case "cekcantik":  await handleCekCantik(sock, msg, jid, sender, text); break;
      case "ceksaldo":   await handleCekSaldo(sock, msg, jid, sender); break;
      case "cekjodoh":   await handleCekJodoh(sock, msg, jid, sender, text); break;
      case "cekiq":      await handleCekIQ(sock, msg, jid, sender); break;
      case "ceknasib":   await handleCekNasib(sock, msg, jid, sender); break;
      case "cekhoki":    await handleCekHoki(sock, msg, jid, sender, text); break;
      case "cekboty":    await handleCekBoty(sock, msg, jid, sender); break;

      case "slot": await handleSlot(sock, msg, jid, sender, args); break;
      case "saldo": await handleSaldoGame(sock, msg, jid, sender); break;
      case "tambahsaldo": await handleTambahSaldo(sock, msg, jid, sender, args, mentionedJid); break;
      case "blacklist": await handleBlacklist(sock, msg, jid, sender, args, mentionedJid, false); break;
      case "unblacklist": await handleBlacklist(sock, msg, jid, sender, args, mentionedJid, true); break;

      case "suitpvp":
        if (!isGroup) { await reply(sock, msg, "❌ Hanya bisa di dalam grup!"); break; }
        await handleSuitPvp(sock, msg, jid, sender, mentionedJid);
        break;

      case "brat":   await handleBrat(sock, msg, jid, args.join(" "), false); break;
      case "brathd": await handleBrat(sock, msg, jid, args.join(" "), true); break;
      case "bratvid": await handleBratVid(sock, msg, jid, args.join(" ")); break;

      case "s": case "sticker":
        await handleSticker(sock, msg, jid); break;

      case "smeme":
        await handleSmeme(sock, msg, jid, args.join(" ")); break;

      default: break;
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ═════════════════════════════════════════════════════════
//  CONNECT — PAIRING CODE
// ═════════════════════════════════════════════════════════

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(global.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: false,
  });

  if (!state.creds.registered) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("📱 Nomor WA (628xxx): ", async (phone) => {
      rl.close();
      phone = phone.replace(/[^0-9]/g, "");
      const code = await sock.requestPairingCode(phone);
      console.log("\n╔══════════════════════════════════╗");
      console.log(`║  🔑 KODE: ${code.match(/.{1,4}/g).join("-")}            ║`);
      console.log("╚══════════════════════════════════╝");
      console.log("📲 WA → Perangkat Tertaut → Tautkan dengan nomor → masukkan kode\n");
    });
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log(`✅ ${global.namabot} terhubung! Prefix: ${global.prefix}`);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("⚠️ Reconnecting...");
        setTimeout(connectWhatsApp, 3000);
      } else {
        console.log("❌ Logged out. Hapus folder session lalu jalankan ulang.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      await handleMessage(sock, msg);
    }
  });
}

console.log(`\n🎮 Starting ${global.namabot}...\n`);
connectWhatsApp().catch(console.error);
