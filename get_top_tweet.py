import http.client
import json

def get_top_crypto_tweet():
    conn = http.client.HTTPSConnection("twitter241.p.rapidapi.com")

    headers = {
        'x-rapidapi-key': "4220ba6275mshf512f14779d4478p16077ejsn98b97baa57f7",
        'x-rapidapi-host': "twitter241.p.rapidapi.com"
    }

    conn.request("GET", "/search-v2?type=Top&count=1&query=crypto", headers=headers)

    res = conn.getresponse()
    data = res.read()
    decoded = data.decode("utf-8")
    tweet_data = json.loads(decoded)

    try:
        tweet = tweet_data['data'][0]
        text = tweet['text']
        username = tweet['user']['screen_name']
        url = f"https://twitter.com/{username}/status/{tweet['id_str']}"
        return f"Top Tweet about crypto:\n\n{text}\n\n🔗 {url}"
    except Exception as e:
        return f"Error parsing tweet data: {e}"

if __name__ == "__main__":
    print(get_top_crypto_tweet())
