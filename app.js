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
  "steel",
  "ravshann",
  "renatko",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "kerimch1k",
  "renatkobmw"
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
// 📌 Fallback: визначення справжнього логіну через URL
// ===============================
async function resolveRealLogin(name) {
  try {
    const url = `https://www.twitch.tv/${name}`;

    const res = await axios.head(url, {
      maxRedirects: 5,
      validateStatus: () => true
    });

    const finalUrl = res.request.res.responseUrl;

    const login = finalUrl
      .replace("https://www.twitch.tv/", "")
      .split("?")[0]
      .trim();

    return login;
  } catch (err) {
    return name;
  }
}

// ===============================
// 📌 HTML-перевірка (stream.id у JSON)
// ===============================
async function checkHTMLStream(streamer) {
  try {
    const url = `https://www.twitch.tv/${streamer}`;
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = res.data;

    const match = html.match(/"stream":({.*?})/);
    if (!match) return false;

    const streamData = JSON.parse(match[1]);
    if (streamData && streamData.id) return true;

    return false;
  } catch {
    return false;
  }
}

// ===============================
// 📌 m3u8‑детектор
// ===============================
async function checkM3U8Stream(streamer) {
  try {
    const gqlUrl = "https://gql.twitch.tv/gql";
    const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

    const body = [
      {
        operationName: "PlaybackAccessToken_Template",
        variables: {
          isLive: true,
          login: streamer,
          isVod: false,
          vodID: "",
          playerType: "site"
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash:
              "0828119ded1c1347794d5f1c9a1e9c1f9c9e1e5c2f9f9c1f9b9c9e9f9d9c9e9"
          }
        }
      }
    ];

    const tokenRes = await axios.post(gqlUrl, body, {
      headers: {
        "Client-ID": clientId,
        "Content-Type": "application/json"
      }
    });

    const data = tokenRes.data?.[0]?.data?.streamPlaybackAccessToken;
    if (!data || !data.signature || !data.value) return false;

    const sig = data.signature;
    const token = encodeURIComponent(data.value);

    const m3u8Url = `https://usher.ttvnw.net/api/channel/hls/${streamer}.m3u8?client_id=${clientId}&sig=${sig}&token=${token}&allow_source=true&allow_audio_only=true`;

    const m3u8Res = await axios.get(m3u8Url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      validateStatus: () => true
    });

    if (m3u8Res.status !== 200) return false;
    if (!m3u8Res.data.includes("#EXTM3U")) return false;

    return true;
  } catch {
    return false;
  }
}

// ===============================
// 📌 Перевірка одного стрімера
// ===============================
async function checkStreamer(streamer) {
  // 1️⃣ API
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

  // 2️⃣ URL fallback
  const realLogin = await resolveRealLogin(streamer);

  if (realLogin !== streamer) {
    const res2 = await safeAxios(
      () =>
        axios.get(
          `https://api.twitch.tv/helix/streams?user_login=${realLogin}`,
          {
            headers: {
              "Client-ID": TWITCH_CLIENT_ID,
              Authorization: `Bearer ${accessToken}`
            }
          }
        ),
      realLogin
    );

    if (res2.data.data.length > 0) {
      return res2.data.data[0];
    }
  }

  // 3️⃣ HTML
  if (await checkHTMLStream(streamer)) {
    return {
      user_login: streamer,
      title: "LIVE (HTML DETECTED)",
      game_name: "Unknown",
      started_at: new Date().toISOString()
    };
  }

  // 4️⃣ m3u8
  if (await checkM3U8Stream(streamer)) {
    return {
      user_login: streamer,
      title: "LIVE (M3U8 DETECTED)",
      game_name: "Unknown",
      started_at: new Date().toISOString()
    };
  }

  return null;
}

// ===============================
// 📌 Перевірка всіх стрімерів
// ===============================
async function checkStreams() {
  if (!accessToken) return;

  for (const streamer of streamers) {
    const stream = await checkStreamer(streamer);

    if (stream) {
      const title = stream.title || "Без назви";
      const category = stream.game_name || "Без категорії";

      const text =
        `🟢 *${stream.user_login}*\n` +
        `🎮 *${category}*\n` +
        `📝 ${title}\n` +
        `🔗 https://twitch.tv/${stream.user_login}`;

      // 🟢 НОВИЙ СТРИМ
      if (!streamInfo[streamer] || !streamInfo[streamer].online) {
        const msg = await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              text,
              parse_mode: "Markdown"
            }
          )
        );

        streamInfo[streamer] = {
          messageId: msg.data.result.message_id,
          title,
          category,
          startedAt: stream.started_at
            ? new Date(stream.started_at)
            : new Date(),
          online: true
        };

        continue;
      }

      // 🔄 ОНОВЛЕННЯ НАЗВИ / КАТЕГОРІЇ
      if (
        streamInfo[streamer].title !== title ||
        streamInfo[streamer].category !== category
      ) {
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
              text,
              parse_mode: "Markdown"
            }
          )
        );

        streamInfo[streamer].messageId = msg.data.result.message_id;
        streamInfo[streamer].title = title;
        streamInfo[streamer].category = category;
      }
    }

    // 🔴 СТРИМ ЗАКІНЧИВСЯ
    else {
      if (streamInfo[streamer] && streamInfo[streamer].online) {
        const start = streamInfo[streamer].startedAt;
        const end = new Date();

        const diff = Math.floor((end - start) / 1000);
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);

        const offlineText =
          `🔴 *${streamer}*\n` +
          `Стрім закінчився\n` +
          `🟢 Почався: ${start.toLocaleString()}\n` +
          `🔴 Закінчився: ${end.toLocaleString()}\n` +
          `⏱️ Тривалість: ${hours} год ${minutes} хв`;

        await safeAxios(() =>
          axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              message_id: streamInfo[streamer].messageId,
              text: offlineText,
              parse_mode: "Markdown"
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
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
});
