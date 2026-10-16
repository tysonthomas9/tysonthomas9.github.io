---
title: 'A zero-knowledge pastebin with no servers'
description: 'NoBin took the 0bin idea, a pastebin that can’t read your pastes, and moved it onto S3, API Gateway, Lambda and DynamoDB. The browser encrypts, Lambda only signs URLs, and the ciphertext goes straight to S3. How it works, how the key stays secret, how pastes expire, and what’s still rough.'
date: 2016-07-11
tags: [Serverless, AWS, Cryptography, Web]
hero: ./architecture.png
heroAlt: 'An isometric technical drawing on cream grid paper, titled "A pastebin with no servers" and subtitled: the browser encrypts, Lambda only signs URLs, and S3 stores ciphertext it cannot read. Each part is a shaded 3D block with one hatched side. On the left is a tall block for the Browser, with a browser window drawn on its front face (three small circles in a title bar and lines of text); its callout reads: Browser, SJCL encrypts and decrypts. A small cube sits on top of the browser block, labelled #KEY: 256 random bits, never leaves the browser. Below it, a short cylinder labelled Static site, public S3, page + JS, has an arrow pointing up into the browser. From the browser, an arrow labelled {expiration} or {location} runs to a thin upright slab labelled API Gateway, 2 POST endpoints, and a dashed arrow labelled signed URL comes back. The slab has arrows to two cubes marked with a lambda sign: λ upload-data-s3-url (new uid, sign PUT) and λ get-data-s3-url (check expiry, sign GET). Both cubes have arrows to a stack of three flat slabs on the right labelled DynamoDB: uid + expiration, no paste content. At the bottom, a large cylinder labelled Private S3 bucket (ciphertext JSON only; once/, 1_day/, 1_month/) is joined to the browser by a heavy two-headed arrow labelled Ciphertext: PUT / GET with the signed URL, no Lambda in between. A footer reads: the key never appears in any request; Lambda only ever sees the expiry choice and the paste location.'
draft: true
---

You paste something you'd rather not leave lying around, like a config snippet or a log with secrets in it. You pick how long it should live, click Submit, and get a link. Whoever opens the link sees the paste. The service that stores it never can, because it only ever holds a scrambled copy and never gets the key.

Pick "burn after reading" and the paste is served one last time to the person you sent it to, then the link stops working. Pick a day or a month and it stops working after that.

That's NoBin, which we built with the Kadima Services team. The idea of a pastebin that can't read your pastes wasn't ours. What we wanted was that idea with nothing to run: deploy it once, and have no server to patch, watch or keep alive. This post covers where the idea came from, how we got the server out of the way, how the key stays secret, how pastes expire, and what's still rough.

## Starting from 0bin

The idea comes from [0bin](https://github.com/sametmax/0bin), an open-source pastebin. Your browser encrypts the paste before sending it, and the key goes in the part of the link after the `#`, which browsers never send to a server. The server stores a blob it can't open.

0bin still needs a server, though. It's a Python app, so someone has to host it, patch it and keep it up.

NoBin keeps 0bin's look and its encryption almost untouched: the same page design, the same code colouring, the same little "visual hash" picture, the same history of your recent pastes, and a byte-for-byte copy of the same encryption library, SJCL. What we replaced was everything behind the page. The server became a handful of managed AWS services: S3 for storage, API Gateway and Lambda for the little bit of logic, and DynamoDB to keep track of expiry.

| | 0bin | NoBin |
|---|---|---|
| **The backend** | A Python app on a server | Two small Lambda functions |
| **Where the encrypted paste goes** | Through the app | Straight from the browser to a private S3 bucket |
| **Who looks after it** | Whoever runs the server | AWS, once it's deployed |
| **Where the key lives** | After the `#` | After the `#` |

## Getting the server out of the way

The obvious serverless design would send the encrypted paste to a Lambda function and have it save the paste to S3. We didn't do that. The Lambda functions never see the paste at all.

Instead they hand out **pre-signed URLs**. A pre-signed URL is like a valet ticket for one spot in the car park. It's a normal S3 address with a signature attached, and whoever holds it can do one specific thing, like upload one file to one place, without any AWS login of their own. So the browser asks a Lambda function for a ticket, then uploads the encrypted paste to S3 itself.

That shrinks the backend's whole job to three things: decide where a paste goes, remember when it expires, and sign a URL for it. Each of the two Lambda functions does one side of that, one for creating pastes and one for reading them. DynamoDB holds one tiny record per paste: an ID and an expiry. The page itself is plain HTML and JavaScript, meant to be served from a separate public S3 bucket.

## Making a paste

![A sequence diagram titled "Ciphertext goes straight to S3", subtitled: the Lambda function never sees the paste; it hands out an upload URL and writes down when the paste should expire. Four lifelines, each headed by a small isometric icon above a labelled box: a browser block for Browser (behavior.js + SJCL), a cube for the upload-data-s3-url Lambda (via API Gateway), stacked slabs for DynamoDB (upload-metadata) and a cylinder for Private S3 (upload-data). Step 1, in the browser: makeKey(256), 256 random bits from sjcl.random. Step 2, in the browser: sjcl.encrypt(key, paste), refusing anything over 512,000 bytes. Step 3: the browser POSTs {expiration} to the Lambda, for example "1_day"; nothing else is sent. Step 4, in the Lambda: make a new uid and sign a putObject URL; the uid is a random number from 1 to 10,000, a dash and a millisecond timestamp, and the URL is signed for Content-Type application/json. Step 5: the Lambda puts {uid, expiration} into DynamoDB, where expiration is a timestamp or "once". Step 6, dashed: the Lambda returns {location, s3SignedUrl}, where location is 1_day/<uid>. Step 7: the browser PUTs {content: <SJCL JSON>, expiration} straight to the private S3 bucket, with no Lambda in the path. Step 8, highlighted: the browser goes to /paste/index.html?data=1_day/<uid>#<key>; the key rides in the # fragment and the URL is saved to local history.](./create-paste.png)

*The paste never passes through Lambda. Look at what each arrow carries: the only thing sent to the backend is the expiry choice.*

When you click Submit, your browser does the heavy lifting:

1. **It makes a key.** SJCL produces 256 random bits. It starts gathering randomness as soon as the page loads.
2. **It encrypts the paste.** The result is a small bundle of JSON: the scrambled text, a random IV and salt, and the cipher settings.
3. **It checks the size.** If that bundle is over 512,000 bytes (about 500 KB), the page says no.
4. **It asks for an upload ticket.** It sends only the expiry you picked. No paste, no key.
5. **Lambda picks a spot.** It makes an ID, files it under `once/`, `1_day/` or `1_month/`, signs an upload URL for that spot, writes the ID and expiry to DynamoDB, and sends back the location and the URL.
6. **The browser uploads straight to S3.** The bucket now holds a paste it has no way to read.
7. **You get your link.** The browser takes you to the paste page, with the location in the address and the key after the `#`.

A paste holds one thing: the text you typed or pasted, or a single file. If you pick or drop several files, only the first is used, and images are shrunk to fit within 1,024 px before they're encrypted.

## The key stays behind the \#

![A sequence diagram titled "The key stays behind the #", subtitled: browsers don't send the URL fragment, so the half of the link that can decrypt the paste never reaches AWS. At the top, the paste URL /paste/index.html?data=1_day/<uid>#<key> is bracketed: the 1_day/<uid> part is "sent as {location}" and the <key> part is "never sent". Four lifelines, each headed by a small isometric icon above a labelled box: a browser block for Browser (paste/index.html), a cube for the get-data-s3-url Lambda (via API Gateway), stacked slabs for DynamoDB (upload-metadata) and a cylinder for Private S3 (upload-data). Step 1: the browser POSTs {location}, "1_day/<uid>", with no key. Step 2: the Lambda gets the uid from DynamoDB. Step 3, dashed: DynamoDB returns the expiration, which is "once", "delete" or a timestamp; see figure 4. Step 4, dashed: the Lambda returns {s3SignedUrl, timeToExpiry}, or {error: "Data not found or expired"}. Step 5: the browser GETs the signed URL from S3. Step 6, dashed: S3 returns {content: <SJCL JSON>, expiration}, ciphertext only. Step 7, highlighted, in the browser: sjcl.decrypt(key from #, content), then show the text with Prettify, or an <img> if the result is a data:image URL. A box on the right, "What the AWS side can see", lists: expiry choice, paste location, timing, ciphertext size, and the SJCL envelope (IV, salt, parameters). Never: the key or the plaintext.](./read-paste.png)

*The link has two halves. Only the part before the `#` ever reaches AWS. The box on the right lists everything the AWS side can see.*

When someone opens your link, the page sends the part before the `#`, the paste's location, to the other Lambda function. That function checks DynamoDB to see if the paste is still alive, and if it is, sends back a signed download URL. The browser fetches the scrambled paste from S3, takes the key from after the `#`, and unscrambles it on the spot. Text gets code colouring; an image is shown as an image.

The key never appears in any request, so it can't turn up in any log. It's worth being exact about what that does and doesn't protect, though. The AWS side, and whoever runs the deployment, can still see:

- which expiry you picked
- the paste's location
- when it was created and read
- how big the encrypted paste is
- the encryption settings, IV and salt, but not the key
- the usual request details in API Gateway and S3 logs

What they can't see is the key or your text. That only holds as long as the JavaScript they serve you is honest, and the FAQ, which NoBin inherited from 0bin, says so plainly. Its argument is that this protects the *host*: you can't be asked to moderate what you can't read. If you need to be sure nobody can ever read your data, it says, don't use it.

**A note on the cipher.** NoBin uses SJCL's defaults: AES in CCM mode with a **128-bit** key, a 64-bit authentication tag, and PBKDF2 with 1,000 iterations. The 256 random bits are used as a *password*, and PBKDF2 turns that into the 128-bit key. That's still strong, because the password is 256 random bits rather than something a person typed. Put precisely, it's AES-128-CCM with a 256-bit random password.

## Pastes that burn and expire

![An isometric drawing titled "A small state machine in DynamoDB", subtitled: each read of a paste checks one DynamoDB record; nothing runs on a timer, and expiry is only noticed when someone asks. Each state is a shaded 3D block with its name on the top face. Top row, labelled Burn after reading (also "Never" and anything unknown): a block "once" (written at create) leads, on arrow 1, read 1, to a block "delete" (one read left); read 1 serves the paste and flips the record to "delete". A note says read 1 is usually the creator's own redirect to the new paste. Arrow 2, read 2, serves the paste and deletes the record, and leads to an empty block drawn only in dashed lines, labelled no record: "Data not found or expired". Bottom row, labelled 1 day / 1 month (now plus 1 day or plus 1 month, stored as a millisecond timestamp): a block "timestamp" has a loop arrow, a, read before expiry: serve it with "Expiration in 3 hours"-style text. Arrow b, read after expiry, deletes the record and returns the error, leading up to the same dashed no-record block. A footer reads: the S3 object is never deleted by this code; the README leans on S3 Object Expiration for that, and the template doesn't define a rule.](./expiry-states.png)

*Nothing here runs on a timer. Each state only changes when someone reads the paste.*

The form offers three choices: burn after reading, 1 day, or 1 month.

**Burn after reading** sounds like it should allow one read. It allows two, and the code shows why. The first person to open a new paste is nearly always its creator, because the browser goes straight to the paste page after uploading. So the first read serves the paste and marks it "delete". The second read, normally the person you shared it with, serves it one last time and removes the record. After that, the link says "Data not found or expired". 0bin works the same way. The page tells you which state you're in: "This paste will be deleted the next time it is read", or, on the last read, "This paste has self-destructed."

**A day or a month** is stored as a time. Read it before then and you get the paste, with a note like "Expiration in 3 hours". Read it after and the record is deleted and you get the error.

The catch is that expiry is lazy. Nothing sweeps up old pastes on a schedule. An expired record stays in DynamoDB until someone asks for it.

## Three details hiding in the code

**Compression is switched off.** The encryption code, carried over from 0bin, still has a compression step before encrypting, but the line is commented out, with a note that it created a bug with JPG images. Pastes are encrypted uncompressed.

**"Never" doesn't mean never.** The "clone paste" form on the paste page offers a **Never** option. The Lambda function doesn't recognise it, and anything it doesn't recognise is treated as burn after reading.

**Deleting the record doesn't delete the paste.** Once the DynamoDB record is gone, nobody gets a new download URL, but the encrypted file stays in S3. The README leans on S3 Object Expiration for that, and the `once/`, `1_day/` and `1_month/` folders are laid out for per-folder expiry rules. But no such rule is in the setup template.

## Shipping it

We deploy NoBin with the Serverless Framework. The setup is four commands, run in order: `serverless project init`, `npm install` in the API folder, `serverless dash deploy` for the functions, and `serverless endpoint deploy -a` for the endpoints. Uploading the page itself isn't scripted.

The setup template creates three things. The first is an IAM role for the functions, with logging plus full access to the paste table and the bucket's files. The second is a DynamoDB table keyed on the paste ID, with 1 read and 1 write unit of capacity, which is kept even if the stack is deleted. The third is the private bucket, which accepts uploads and downloads from any website so the browser can talk to it directly. The functions run on Node.js 4.3 with 256 MB of memory and a 30-second timeout, using the AWS SDK built into the Lambda runtime.

## What's still rough

NoBin works, but it has some sharp edges.

**Paste IDs are guessable.** An ID is a random number from 1 to 10,000 plus the time in milliseconds, using `Math.random()`, which isn't built for security. A guesser can't read anything, because the content is still encrypted. But they could burn someone else's burn-after-reading paste just by opening it.

**The permissions are too broad.** The functions can do anything (`"*"`) to the table and the bucket's files. The API has no login or rate limit, and any website can call it.

**Errors look like successes.** Every error comes back with HTTP status 200 and an `{error}` message inside.

**The visual hash is always the same.** It's worked out from the page's address, which is the same for every paste, so every paste gets the same picture.

**There are no tests.** The sample events for both functions are empty.

## What we'd tell someone starting out

1. **Keep your backend out of the data path.** If a function only signs URLs, it can't leak, log or mangle the data, and it costs almost nothing to run.
2. **Put the key where the server can't see it.** The part of a link after the `#` never leaves the browser, which makes it a simple, reliable place for a secret.
3. **Be honest about what "zero-knowledge" covers.** The host still sees timing, sizes and settings, and it serves the code that does the encrypting.
4. **Put clean-up in the infrastructure, not just the code.** Lazy expiry hides records; it doesn't delete files.
5. **Use secure random IDs even when the content is encrypted.** A guessable ID still lets a stranger burn your paste.

NoBin does what we set out to do: a pastebin that can't read your pastes, with no server to look after.

## The code

The code is on GitHub at [kadima-services/NoBin](https://github.com/kadima-services/NoBin). It's small: two Lambda functions with a shared library, a CloudFormation template, a four-step setup guide, and the static site.

## Credits

NoBin was built with the Kadima Services team. It's based on [0bin](https://github.com/sametmax/0bin), whose page design, encryption code and FAQ we reused. Thanks also to the projects underneath it: the [Stanford JavaScript Crypto Library](http://crypto.stanford.edu/sjcl/), jQuery, Bootstrap, Prettify and VizHash.js.
