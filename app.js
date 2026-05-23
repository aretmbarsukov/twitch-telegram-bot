// import express from "express";
// import axios from "axios";

// const app = express();
// app.use(express.json({ type: "*/*" }));

// const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
// const TWITCH_SECRET = process.env.TWITCH_SECRET;

// let accessToken = null;

// // СПИСОК СТРІМЕРІВ (як раніше)
// const streamers = [
//   "ant1ka",
//   "steel",
//   "ravshann",
//   "renatko",
//   "steelaaga",
//   "ravshanbtw",
//   "anarabdullaev",
//   "kerimch1k",
//   "renatkobmw",  
//   "dedadam",
//   "vitollo_13",
//   "chpokoff",
//   "ereek",
//   "dankzlv",
//   "tadzheek"
// ];

// let streamInfo = {};
// let lastError = "";


// // ===============================
// // 📌 Надсилання помилки в Telegram
// // ===============================
// async function sendErrorToTelegram(error, streamer = null) {
//   const text =
//     `🔥 *BOT ERROR ALERT*\n\n` +
//     (streamer ? `Стрімер: *${streamer}*\n\n` : "") +
//     `❗ Помилка:\n\`\`\`\n${error.stack || error}\n\`\`\`\n` +
//     `🕒 Час: ${new Date().toISOString()}`;

//   if (text === lastError) return;
//   lastError = text;

//   try {
//     await axios.post(
//       `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
//       {
//         chat_id: TELEGRAM_CHAT_ID,
//         text,
//         parse_mode: "Markdown"
//       }
//     );
//   } catch (err) {
//     console.log("Помилка надсилання помилки в Telegram:", err);
//   }
// }


// // ===============================
// // 📌 safeAxios — ловить помилки
// // ===============================
// async function safeAxios(request, streamer = null) {
//   try {
//     const result = await request();
//     lastError = "";
//     return result;
//   } catch (err) {
//     await sendErrorToTelegram(err, streamer);
//     throw err;
//   }
// }


// // ===============================
// // 📌 Отримання Twitch токена
// // ===============================
// async function getTwitchToken() {
//   await safeAxios(async () => {
//     const res = await axios.post(
//       `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
//     );
//     accessToken = res.data.access_token;
//   });
// }


// // ===============================
// // 📌 Fallback: визначення справжнього логіну через URL
// // ===============================
// async function resolveRealLogin(name) {
//   try {
//     const url = `https://www.twitch.tv/${name}`;

//     const res = await axios.head(url, {
//       maxRedirects: 5,
//       validateStatus: () => true
//     });

//     const finalUrl = res.request.res.responseUrl;

//     const login = finalUrl
//       .replace("https://www.twitch.tv/", "")
//       .split("?")[0]
//       .trim();

//     console.log(`Resolved ${name} → ${login}`);

//     return login;
//   } catch (err) {
//     console.log("resolveRealLogin error:", err);
//     return name;
//   }
// }


// // ===============================
// // 📌 Перевірка одного стрімера
// // ===============================
// async function checkStreamer(streamer) {
//   // 1️⃣ Перевірка по логіну (як раніше)
//   const res = await safeAxios(
//     () =>
//       axios.get(
//         `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
//         {
//           headers: {
//             "Client-ID": TWITCH_CLIENT_ID,
//             Authorization: `Bearer ${accessToken}`
//           }
//         }
//       ),
//     streamer
//   );

//   if (res.data.data.length > 0) {
//     return res.data.data[0];
//   }

//   // 2️⃣ Якщо не знайдено — fallback через URL
//   const realLogin = await resolveRealLogin(streamer);

//   if (realLogin !== streamer) {
//     const res2 = await safeAxios(
//       () =>
//         axios.get(
//           `https://api.twitch.tv/helix/streams?user_login=${realLogin}`,
//           {
//             headers: {
//               "Client-ID": TWITCH_CLIENT_ID,
//               Authorization: `Bearer ${accessToken}`
//             }
//           }
//         ),
//       realLogin
//     );

//     if (res2.data.data.length > 0) {
//       return res2.data.data[0];
//     }
//   }

//   return null;
// }


// // ===============================
// // 📌 Перевірка всіх стрімерів
// // ===============================
// async function checkStreams() {
//   if (!accessToken) return;

//   for (const streamer of streamers) {
//     const stream = await checkStreamer(streamer);

//     if (stream) {
//       const title = stream.title;
//       const url = `https://twitch.tv/${stream.user_login}`;
//       const text = `🟢 ${stream.user_login}\n${title}\n${url}`;

//       if (!streamInfo[streamer] || !streamInfo[streamer].online) {
//         const msg = await safeAxios(() =>
//           axios.post(
//             `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
//             {
//               chat_id: TELEGRAM_CHAT_ID,
//               text
//             }
//           )
//         );

//         streamInfo[streamer] = {
//           messageId: msg.data.result.message_id,
//           title,
//           online: true
//         };

//         continue;
//       }

//       if (streamInfo[streamer].title !== title) {
//         await safeAxios(() =>
//           axios.post(
//             `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
//             {
//               chat_id: TELEGRAM_CHAT_ID,
//               message_id: streamInfo[streamer].messageId
//             }
//           )
//         );

//         const msg = await safeAxios(() =>
//           axios.post(
//             `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
//             {
//               chat_id: TELEGRAM_CHAT_ID,
//               text
//             }
//           )
//         );

//         streamInfo[streamer].messageId = msg.data.result.message_id;
//         streamInfo[streamer].title = title;
//       }
//     } else {
//       if (streamInfo[streamer] && streamInfo[streamer].online) {
//         const offlineText = `🔴 ${streamer}\nСТРИМ ЗАКОНЧИЛСЯ\n🔴`;

//         await safeAxios(() =>
//           axios.post(
//             `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
//             {
//               chat_id: TELEGRAM_CHAT_ID,
//               message_id: streamInfo[streamer].messageId,
//               text: offlineText
//             }
//           )
//         );

//         streamInfo[streamer].online = false;
//       }
//     }
//   }
// }


// // ===============================
// // 📌 Express
// // ===============================
// app.get("/", (req, res) => {
//   res.send("Bot is running");
// });


// // ===============================
// // 📌 Запуск
// // ===============================
// app.listen(process.env.PORT || 3000, async () => {
//   await getTwitchToken();
//   setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
//   setInterval(checkStreams, 30 * 1000);
// });





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
  "renatkobmw",
  "ant1ka",
  "dedadam",
  "vitollo_13",
  "chpokoff",
  "ereek",
  "dankzlv",
  "tadzheek"
];

let streamInfo = {};

async function getTwitchToken() {
  const res = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
  );
  accessToken = res.data.access_token;
}

async function checkStreams() {
  if (!accessToken) return;

  const params = streamers.map(s => `user_login=${s}`).join("&");

  const res = await axios.get(
    `https://api.twitch.tv/helix/streams?${params}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const onlineStreams = res.data.data;

  const onlineMap = {};
  for (const stream of onlineStreams) {
    onlineMap[stream.user_login] = stream;
  }

  for (const streamer of streamers) {
    const stream = onlineMap[streamer];

    if (stream) {
      const title = stream.title;
      const url = `https://twitch.tv/${streamer}`;
      const text = `🟢 ${streamer}\n${title}\n${url}`;

      if (!streamInfo[streamer] || !streamInfo[streamer].online) {
        const msg = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text
          }
        );

        streamInfo[streamer] = {
          messageId: msg.data.result.message_id,
          title,
          online: true
        };

        continue;
      }

      if (streamInfo[streamer].title !== title) {
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: streamInfo[streamer].messageId
          }
        );

        const msg = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            text
          }
        );

        streamInfo[streamer].messageId = msg.data.result.message_id;
        streamInfo[streamer].title = title;
      }
    } else {
      if (streamInfo[streamer] && streamInfo[streamer].online) {
        const offlineText = `🔴 ${streamer}\nСТРИМ ЗАКОНЧИЛСЯ\n🔴`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
          {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: streamInfo[streamer].messageId,
            text: offlineText
          }
        );

        streamInfo[streamer].online = false;
      }
    }
  }
}

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, async () => {
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
});
