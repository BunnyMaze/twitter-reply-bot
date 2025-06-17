import express from 'express';
import bodyParser from 'body-parser';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const RATE_LIMIT_MS = 7.2 * 60 * 60 * 1000; // 7,2 Stunden
let lastRun = 0;

const {
  TWITTER_APP_KEY,
  TWITTER_APP_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  OPENAI_API_KEY,
  IMAGE_URLS,
} = process.env;

// Twitter Client (OAuth 1.0a User Context for Write + Media)
const rwClient = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

// OpenAI Client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Bilder hochladen
async function uploadImages(rwClient, imageUrls) {
  const mediaIds = [];
  for (const imageUrl of imageUrls) {
    try {
      console.log('Downloading image from:', imageUrl);
      const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      console.log(`Image downloaded, size: ${imageResp.data.length} bytes`);

      const mediaId = await rwClient.v1.uploadMedia(Buffer.from(imageResp.data), { type: 'png' });
      if (!mediaId) {
        console.error('Media upload failed, no mediaId returned for:', imageUrl);
      } else {
        console.log('Media uploaded successfully, mediaId:', mediaId);
        mediaIds.push(mediaId);
      }
    } catch (error) {
      console.error('Error uploading media for URL:', imageUrl);
      console.error(error);
    }
  }
  return mediaIds;
}

app.post('/tweet-reply', async (req, res) => {
  try {
    const now = Date.now();
    if (now - lastRun < RATE_LIMIT_MS) {
      console.log('Rate limit active, skipping this run.');
      return res.status(429).send('Rate limit active');
    }
    lastRun = now;

    const { url } = req.body;
    if (!url) return res.status(400).send('Missing url');

    // Tweet-ID aus URL extrahieren
    const match = url.match(/status\/(\d+)/);
    if (!match) return res.status(400).send('Invalid tweet URL');

    const tweetId = match[1];
    console.log('Tweet ID extracted:', tweetId);

    // Tweet abrufen
    const tweet = await rwClient.v2.singleTweet(tweetId, { 'tweet.fields': ['text','author_id'] });
    if (!tweet || !tweet.data) return res.status(404).send('Tweet not found');

    const tweetText = tweet.data.text;
    console.log('Fetched tweet text:', tweetText);

    // GPT Prompt
    const prompt = `
You are a friendly crypto meme bot. Reply in English max 250 chars. Mention the crypto token $KOII and Twitter @KoiiFoundation. Make the reply appealing and directly related to this tweet:
${tweetText}
Do not use quotation marks in the reply.
`;

    // GPT-4o-mini Completion
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    let replyText = completion.choices[0].message.content.trim();
    if (replyText.length > 250) replyText = replyText.slice(0, 250);

    // Bilder hochladen
    const imageUrls = IMAGE_URLS ? IMAGE_URLS.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mediaIds = await uploadImages(rwClient, imageUrls);

    // Antwort posten
    const replyOptions = mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {};
    await rwClient.v2.reply(replyText, tweetId, replyOptions);

    console.log('Replied to tweet', tweetId, 'with:', replyText);
    res.status(200).send('Reply sent');
  } catch (error) {
    console.error('Error in /tweet-reply:', error);
    res.status(500).send('Internal server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
