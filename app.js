import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let streamInfo = {};
let lastError = "";

const streamers = [
  "ant1ka",
  "steel",
  "ravshann",
  "renatko",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "kerimch1k",
  "renatkobmw",
  "dedadam",
  "vitollo_13",
  "chpokoff",
  "ereek",
  "dankzlv",
  "tadzheek"
];


// ===============================
// 📌 Надсилання помилки в Telegram
// ===============================
async function sendErrorToTelegram(error, streamer = null) {
  const text =
    `🔥 *BOT ERROR ALERT*\n\n` +
    (streamer ? `Стрімер: *${streamer}*\n\n` : "") +
    `❗ Помилка:\n\`\`\`\n${error.stack || error}\n\`\`\`\n` +
    `🕒 Час: ${new Date().toISOString()}`;

  if (text === lastError) return;
  lastError = text;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown"
      }
    );
  } catch (err) {
    console.log("Помилка надсилання помилки в Telegram:", err);
  }
}


// ===============================
// 📌 safeAxios — ловить помилки
// ===============================
async function safeAxios(request, streamer = null) {
  try {
    const result = await request();
    lastError = "";
    return result;
  } catch (err) {
    await sendErrorToTelegram(err, streamer);
    throw err;
  }
}


// ===============================
// 📌 Перевірка через HTML (таймер + назва)
// ===============================
async function checkStreamByFrontend(streamer) {
  try {
    const url = `https://www.twitch.tv/${streamer}`;
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = res.data;

    console.log(`=== FRONTEND CHECK FOR ${streamer} ===`);

    // 1️⃣ шукаємо таймер стріму
    const timeMatch =
      html.match(/data-a-target="stream-time"[^>]*>(.*?)<\/span>/) ||
      html.match(/class="live-time"[^>]*>(.*?)<\/span>/);

    if (!timeMatch) {
      console.log(`NO TIMER FOUND for ${streamer}`);
      return null;
    }

    const timeText = timeMatch[1].replace(/<[^>]+>/g, "").trim();
    console.log(`TIMER for ${streamer}:`, timeText);

    // 2️⃣ шукаємо назву стріму
    const titleMatch = html.match(/data-a-target="stream-title"[^>]*>(.*?)<\/p>/);

    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "LIVE STREAM";

    console.log(`TITLE for ${streamer}:`, title);

    if (timeText && timeText !== "") {
      return {
        user_login: streamer,
        title
      };
    }

    return null;

  } catch (err) {
    console.log("Frontend check error:", streamer, err.message);
    return null;
  }
}


// ===============================
// 📌 Перевірка одного стрімера (API вимкнено)
// ===============================
async function checkStreamer(streamer) {

  // ❌ API ПОВНІСТЮ ВИМКНЕНИЙ

  // ✔ Перевірка через фронтенд
  const frontendLive = await checkStreamByFrontend(streamer);
  if (frontendLive) {
    return frontendLive;
  }

  return null;
}


// ===============================
// 📌 Перевірка всіх стрімерів
// ===============================
async function checkStreams() {
  for (const streamer of streamers) {
    const stream = await checkStreamer(streamer);

    if (stream) {
      const title = stream.title;
      const url = `https://twitch.tv/${stream.user_login}`;
      const text = `🟢 ${stream.user_login}\n${title}\n${url}`;

      if (!streamInfo[streamer] || !streamInfo[streamer].online) {
        const msg = await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              text
            }
          )
        );

        streamInfo[streamer] = {
          messageId: msg.data.result.message_id,
          title,
          online: true
        };

        continue;
      }

      if (streamInfo[streamer].title !== title) {
        await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              message_id: streamInfo[streamer].messageId
            }
          )
        );

        const msg = await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              text
            }
          )
        );

        streamInfo[streamer].messageId = msg.data.result.message_id;
        streamInfo[streamer].title = title;
      }
    } else {
      if (streamInfo[streamer] && streamInfo[streamer].online) {
        const offlineText = `🔴 ${streamer}\nСТРИМ ЗАКОНЧИЛСЯ\n🔴`;

        await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              message_id: streamInfo[streamer].messageId,
              text: offlineText
            }
          )
        );

        streamInfo[streamer].online = false;
      }
    }
  }
}


// ===============================
// 📌 Express
// ===============================
app.get("/", (req, res) => {
  res.send("Bot is running");
});


// ===============================
// 📌 Запуск
// ===============================
app.listen(process.env.PORT || 3000, async () => {
  setInterval(checkStreams, 30 * 1000);
});
