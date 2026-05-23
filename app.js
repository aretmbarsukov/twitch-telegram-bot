import express from "express";
import axios from "axios";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let streamInfo = {};

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
// 📌 Puppeteer: отримуємо DOM Twitch
// ===============================
async function checkStreamPuppeteer(streamer) {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    await page.goto(`https://www.twitch.tv/${streamer}`, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // чекаємо поки React намалює DOM
    await page.waitForTimeout(3000);

    // шукаємо таймер
    const time = await page.evaluate(() => {
      const el =
        document.querySelector('[data-a-target="stream-time"]') ||
        document.querySelector(".live-time");

      return el ? el.innerText.trim() : null;
    });

    // шукаємо назву стріму
    const title = await page.evaluate(() => {
      const el = document.querySelector('[data-a-target="stream-title"]');
      return el ? el.innerText.trim() : null;
    });

    await browser.close();

    if (time) {
      return {
        user_login: streamer,
        title: title || "LIVE STREAM"
      };
    }

    return null;

  } catch (err) {
    console.log("Puppeteer error:", err.message);
    return null;
  }
}

// ===============================
// 📌 Перевірка одного стрімера
// ===============================
async function checkStreamer(streamer) {
  return await checkStreamPuppeteer(streamer);
}

// ===============================
// 📌 Перевірка всіх стрімерів
// ===============================
async function checkStreams() {
  for (const streamer of streamers) {
    const stream = await checkStreamer(streamer);

    if (stream) {
      const text = `🟢 ${stream.user_login}\n${stream.title}\nhttps://twitch.tv/${stream.user_login}`;

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
          title: stream.title,
          online: true
        };

        continue;
      }

      if (streamInfo[streamer].title !== stream.title) {
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
        streamInfo[streamer].title = stream.title;
      }

    } else {
      if (streamInfo[streamer] && streamInfo[streamer].online) {
        const offlineText = `🔴 ${streamer}\nСТРІМ ЗАКІНЧИВСЯ\n🔴`;

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
  setInterval(checkStreams, 30000);
});
