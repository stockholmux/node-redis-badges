# Redis-Backed Dynamic Images

This module is a proof-of-concept of using Redis and Node.js between a static HTML source (email, plain HTML file, etc.) and outbound links / image URLs. When a user interacts with a link it is pointed at a Node.js server. That server counts the interaction for hotness sitting an individual bit in a bitmap and incrementing a counter to represent popularity thend forwarding on the URL to the correct location.

The "badge" images are also served by the Node.js server. Instead of directly serving them, Node.js grabs the previously stored information from Redis and determines if an item is "hot" (frequently interacted with recently) or the most popular item in a particular campaign. If an item is found to be hot or popular, Node.js sends an HTTP redirect (307) to the approriate badge image. If the item isn't either hot nor popular, then a forward is issued to a blank image.

## Installation and running

Clone the repo and run an install with npm in that directory

```
npm install
```

To run the server, you'll need to provide  the path to your [node_redis connection object](https://github.com/NodeRedis/node_redis#rediscreateclient) (as JSON) in the `credentials` argument

```

node index.js --credentials ~/path/to/the/connection.json

```

Point your browser to [http://localhost:5599/](http://localhost:5599/) for the demo.


## Counting the hotness

Each time an item is interacted with, a single bit is set at a particular index. The index is determined by the number of minutes elapsed since a fixed point in time. Each interaction in that minute threshold flips the bit to one (multiple interactions in the same minute period are not counted in any extra way). This is pretty space efficient way to see when interactions occured.

## Why Redis?

Redis is extremely lightweight in this situations. Considering that the forwards add extra network roundtrips, the situation is not exacerbated by extra DB latency. Also space efficiency of bitmaps is really great in this use case - it would be quite large in other databases.

## Caching considerations

The badge images also have a unique value as the last part of the URL. This is to aid in cache busting as some email web clients may cache images for multiple users. In this way, each user would have a random value as the last part of the badge image url. 

Email clients may still cache images after the initial email view - that's unavoidable, but the badges will still reflect the hotness and popularity at the time of first open.

It's also possible to serve images directly with Node (instead of a 307 forward) in cases caching is particularly stubborn (although I haven't found any cases yet).