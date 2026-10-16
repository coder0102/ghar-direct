# Ghar Direct

A flat and flatmate finder for phones (iPhone and Android), built like a dating app: houses get profiles, you swipe, you like one photo or one answer, and you chat straight with the owner. No broker.

There are two parts:

- `app/` is the phone app (Expo and React Native, one codebase for iOS and Android).
- `server/` is the backend (Node, Express, Postgres). It holds accounts, listings, photos, chats, reports and the admin page.

## What works today

- Sign up and log in.
- Explore: swipe through profiles, filter by whole flats or flatmate rooms, rent and distance. Like a specific photo or answer with a comment. Pass. Each profile shows 6 photos and 3 prompts.
- DMs: the owner sees each like as a request and accepts or declines. Accepted chats are open. New messages show up within a few seconds.
- List: owners, moving-out tenants and people who need a flatmate create a listing in 4 steps (basics, 6 photos, 3 prompts, publish). They can pause and relist.
- Photos: taken live in the app camera, never from the gallery. Each photo is checked against the location saved with the listing (the phone must be within 150 m of it) and uses a one-time code so an old photo cannot be re-sent.
- You: renter card with 3 prompts, ID check, log out, delete account (removes the data).
- Safety: report and block from any profile or chat. Three different people reporting a listing hides it for review. An admin page at `/admin` lists reports.
- Server tests: `cd server && npm test` (13 tests covering the full flow).

## What is a placeholder (read before launching)

1. **The ID check approves everyone.** It is a stand-in (`ID_PROVIDER=stub`). Before real users, connect a real ID verification service. The instructions are at the top of `server/src/idverify.js`. Until then the "ID checked" badge means nothing.
2. **Nothing proves someone owns the flat.** The photo and location checks prove a person was at the place. They do not prove they can rent it out. Decide how you will check ownership (for example a property tax receipt or electricity bill, reviewed in the admin page) before you promise "no brokers".
3. **Location checks can be faked** on a phone with fake-GPS tools. They raise the effort, they are not proof.
4. **Chat has no push notifications.** The app asks the server every few seconds while it is open. Real push alerts are a later job.
5. **Login is email and password.** Many Indian users expect phone number and OTP. That needs an SMS service.
6. **Photos on the server's disk are lost on most hosts** when you redeploy. For a real launch use the `s3` storage setting (below).

## Try it on your phone in about 10 minutes

You need Node 20 or newer, and the free Expo Go app on your phone. Your computer and phone must be on the same Wi-Fi.

1. Start the demo server. It runs on an in-memory database with 6 sample listings and needs no setup:

   ```
   cd server
   npm install
   npm run demo
   ```

   It prints a line like `EXPO_PUBLIC_API_URL=http://192.168.1.20:8080`. Copy that line.

2. In a second terminal, start the app:

   ```
   cd app
   npm install
   ```

   Create a file named `.env` in the `app` folder and paste that line into it. Then:

   ```
   npx expo start
   ```

   Scan the QR code with Expo Go (Camera app on iPhone, Expo Go on Android).

3. Create an account in the app and start swiping. The demo owners (for example `meera@demo.test`, password `demo-pass-123`) can be used to log in on a second phone to see the owner side.

The demo erases everything when you stop it. To test listing a place you must stand near the place: the photo location check needs the phone's real location.

## Go live

1. **Database.** Create a Postgres database (Neon, Supabase, Render and Railway all have free or cheap plans). Copy its connection string.
2. **Photo storage.** Create an S3-compatible bucket (Cloudflare R2 is cheap) and make photos publicly readable. Note the bucket name, keys and public address.
3. **Server settings.** Copy `server/.env.example` to `.env` (or set the same names on your host) and fill in:
   - `DATABASE_URL`, and `DATABASE_SSL=true` on most hosts
   - `JWT_SECRET`: a long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `ADMIN_TOKEN`: the password for the `/admin` page
   - `STORAGE=s3` plus the `S3_*` values
   - `PUBLIC_BASE_URL`: your server's https address
   - `ID_PROVIDER`: leave as `stub` only for testing
4. **Deploy the server** to a host such as Render or Railway (build command `npm install`, start command `npm start`, root folder `server`). Open `https://your-server/health`. It should show `{"ok":true}`.
5. **Point the app at it.** In `app/.env` set `EXPO_PUBLIC_API_URL=https://your-server`.
6. **Make store builds.** In `app/app.json` change `com.yourcompany.ghardirect` (iOS and Android) to your own id. Then run `npx eas-cli@latest build --platform all` and follow the prompts. You need an Apple Developer account and a Google Play developer account (check the current fees). Both stores will ask for a privacy policy, and for apps with accounts they require in-app account deletion, which this app has.
7. **Staff the safety side.** Open `/admin` regularly. Someone has to read the reports and act on them.

## Rules worth keeping

- Do not add filters for religion, caste, marital status or "bachelors not allowed". They are a legal and reputation risk, and they are why many people dislike rental apps.
- Do not show phone numbers or exact addresses in listings. The app keeps the exact address private until people are chatting.

## Where things are

- `server/src/routes/` has one file per area (account, listings, feed, conversations, safety, admin).
- `server/src/schema.js` is the database layout.
- `app/src/app/` has the screens. `app/src/components/` and `app/src/lib/` hold shared pieces and the API client.
