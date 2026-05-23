import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

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

let streamInfo = {};
let lastError = "";


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
// 📌 Отримання Twitch токена
// ===============================
async function getTwitchToken() {
  await safeAxios(async () => {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
    );
    accessToken = res.data.access_token;
  });
}


// ===============================
// 📌 Перевірка через HTML таймер + назву стріму
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

    // 1️⃣ Перевірка таймера стріму
    const liveTimeMatch = html.match(/<span class="live-time">([\s\S]*?)<\/span>/);

    if (!liveTimeMatch) {
      return null; // стрім не йде
    }

    // 2️⃣ Назва стріму
    const titleMatch = html.match(/data-a-target="stream-title"[^>]*>(.*?)<\/p>/);

    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "LIVE STREAM";

    return {
      user_login: streamer,
      title
    };

  } catch (err) {
    console.log("Frontend check error:", err);
    return null;
  }
}


// ===============================
// 📌 Перевірка одного стрімера
// ===============================
async function checkStreamer(streamer) {
  // 1️⃣ API (якщо працює)
  const res = await safeAxios(
    () =>
      axios.get(
        `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
        {
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            Authorization: `Bearer ${accessToken}`
          }
        }
      ),
    streamer
  );

  if (res.data.data.length > 0) {
    return res.data.data[0];
  }

  // 2️⃣ Перевірка через фронтенд (таймер + назва)
  const frontendLive = await checkStreamByFrontend(streamer);
  if (frontendLive) {
    return frontendLive;
  }

  return null;
}


// ===============================
// 📌 Перевірка всіх стрімерів (чанки по 10)
// ===============================
async function checkStreams() {
  if (!accessToken) return;

  const chunkSize = 10;

  for (let i = 0; i < streamers.length; i += chunkSize) {
    const chunk = streamers.slice(i, i + chunkSize);

    for (const streamer of chunk) {
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
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
});
