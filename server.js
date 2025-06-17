import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// OAuth 1.0a mit Schreibrechten (Read & Write) - Stelle sicher, dass alle Umgebungsvariablen korrekt sind
const rwClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// Bild-URLs per Komma getrennt in Umgebungsvariable IMAGE_URLS
const imageUrls = (process.env.IMAGE_URLS || '').split(',').map(url => url.trim()).filter(Boolean);

const MIN_INTERVAL_MS = 432 * 60 * 1000; // 7,2 Stunden
let lastRunTimestamp = 0;

const getRandomImageUrl = () => {
  if (imageUrls.length === 0) return null;
  const idx = Math.floor(Math.random() * imageUrls.length);
  return imageUrls[idx];
};

const generateMemeReply = async (tweetText) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a witty meme bot replying to tweets in English. Always mention the crypto token $KOII and the Twitter account @KoiiFoundation. Keep the reply under 250 characters and make it engaging.',
          },
          {
            role: 'user',
            content: `Reply to this tweet:\n${tweetText}\nDo not put the original tweet in quotes.`,
          },
        ],
        max_tokens: 120,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let reply = response.data.choices[0].message.content.trim();

    if (reply.length > 250) {
      reply = reply.slice(0, 247) + '...';
    }

    return reply;
  } catch (err) {
    console.error('GPT error:', err.message);
    return '🐸💬 Oops! Meme lost in the Koiverse...';
  }
};

app.post('/tweet-reply', async (req, res) => {
  const now = Date.now();
  if (now - lastRunTimestamp < MIN_INTERVAL_MS) {
    console.log('Skipped run: waiting for 7.2 hours interval');
    return res.status(429).json({ message: 'Too many requests, try later.' });
  }
  lastRunTimestamp = now;

  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ message: 'Missing tweet URL' });
    }

    // Tweet ID aus URL extrahieren
    const tweetIdMatch = url.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
      return res.status(400).json({ message: 'Invalid tweet URL format' });
    }
    const tweetId = tweetIdMatch[1];

    // Original-Tweet holen
    const tweet = await rwClient.v2.singleTweet(tweetId, { 'tweet.fields': ['text'] });
    if (!tweet || !tweet.data) {
      return res.status(404).json({ message: 'Tweet not found' });
    }
    const tweetText = tweet.data.text;

    // Antworttext generieren
    const replyText = await generateMemeReply(tweetText);

    // Optional: Bild hochladen und media_id anfügen, falls Bild vorhanden
    let mediaIds = [];
    const imageUrl = getRandomImageUrl();
    if (imageUrl) {
      try {
        const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const mediaId = await rwClient.v1.uploadMedia(Buffer.from(imageResp.data), { type: 'png' });
        mediaIds.push(mediaId);
      } catch (err) {
        console.error('Image upload failed:', err.message);
      }
    }

    // Antwort-Tweet posten (reply to tweetId)
    await rwClient.v2.reply(replyText, tweetId, mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {});

    console.log('Replied to tweet', tweetId);
    res.json({ message: 'Replied successfully', reply: replyText });
  } catch (err) {
    console.error('Error in /tweet-reply:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
