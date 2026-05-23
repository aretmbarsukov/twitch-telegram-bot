import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

// СПИСОК СТРІМЕРІВ (ОНОВЛЕНИЙ)
const streamers = [
  "steel",
  "ravshann",
  "renatko",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "kerimch1k",
  "renatkobmw",
  "antlka",       // ← ПРАВИЛЬНИЙ ЛОГІН
  "dedadam",
  "vitollo_13",
  "chpokoff",
  "ereek",
  "dankzlv",
  "tadzheek"
];

let streamInfo = {};
let lastError = ""; // щоб не спамити однаковими помилками


// ===============================
// 📌 Надсилання помилки в Telegram (без спаму)
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
// 📌 safeAxios — будь-яка помилка → в Telegram
// ===============================
async function safeAxios(request, streamer = null) {
  try {
    return await request();
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
// 📌 Перевірка стрімів
// ===============================
async function checkStreams() {
  if (!accessToken) return;

  for (const streamer of streamers) {
    try {
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

      const isOnline = res.data.data.length > 0;

      if (isOnline) {
        const title = res.data.data[0].title;
        const url = `https://twitch.tv/${streamer}`;
        const text = `🟢 ${streamer}\n${title}\n${url}`;

        if (!streamInfo[streamer] || !streamInfo[streamer].online) {
          const msg = await safeAxios(
            () =>
              axios.post(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
                {
                  chat_id: TELEGRAM_CHAT_ID,
                  text
                }
              ),
            streamer
          );

          streamInfo[streamer] = {
            messageId: msg.data.result.message_id,
            title,
            online: true
          };

          continue;
        }

        if (streamInfo[streamer].title !== title) {
          await safeAxios(
            () =>
              axios.post(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
                {
                  chat_id: TELEGRAM_CHAT_ID,
                  message_id: streamInfo[streamer].messageId
                }
              ),
            streamer
          );

          const msg = await safeAxios(
            () =>
              axios.post(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
                {
                  chat_id: TELEGRAM_CHAT_ID,
                  text
                }
              ),
            streamer
          );

          streamInfo[streamer].messageId = msg.data.result.message_id;
          streamInfo[streamer].title = title;
        }

      } else {
        if (streamInfo[streamer] && streamInfo[streamer].online) {
          const offlineText = `🔴 ${streamer}\nСТРИМ ЗАКОНЧИЛСЯ\n🔴`;

          await safeAxios(
            () =>
              axios.post(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
                {
                  chat_id: TELEGRAM_CHAT_ID,
                  message_id: streamInfo[streamer].messageId,
                  text: offlineText
                }
              ),
            streamer
          );

          streamInfo[streamer].online = false;
        }
      }
    } catch (err) {
      console.log(`Помилка у стрімера ${streamer}:`, err.response?.data || err);
    }
  }
}


// ===============================
// 📌 Глобальні ловці помилок
// ===============================
process.on("unhandledRejection", (err) => sendErrorToTelegram(err));
process.on("uncaughtException", (err) => sendErrorToTelegram(err));


// ===============================
// 📌 Express
// ===============================
app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, async () => {
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
});