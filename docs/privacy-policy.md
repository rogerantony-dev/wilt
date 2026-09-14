# Privacy Policy for Wilt

**Last updated: 6 September 2026**

Wilt is a screen-time app for Android. It counts the time you spend on
Instagram Reels and YouTube Shorts, shows that time back to you, and can block
those feeds once you reach a daily limit you set.

This policy describes what Wilt does with your information. The short version:
Wilt does not collect it, does not send it anywhere, and does not have a server
to send it to.

## What Wilt stores

Wilt stores the following on your device only:

- The daily limit you set, and the mode you chose (time or block).
- How long you have spent on Reels and Shorts today, and on previous days.
- Your streak, points, and which cat images you have unlocked.

This information is kept in your device's private app storage. Nothing else on
your phone can read it.

## What Wilt does not do

- **No accounts.** There is no sign-up, no login, and no profile.
- **No servers.** Wilt contains no code that sends data over the internet. It
  makes no network requests of any kind.
- **No analytics or tracking.** There are no analytics SDKs, crash reporters,
  advertising identifiers, or third-party trackers in the app.
- **No ads.**
- **No selling or sharing.** Since no data is collected or transmitted, there is
  nothing to sell or share with anyone.
- **No cloud backup.** Automatic Android backup is switched off for this app, so
  your usage history is not copied to Google Drive.

## The accessibility service

Wilt uses Android's Accessibility Service API. This is the only way an Android
app can tell what is currently on screen in another app, and Wilt needs that to
know when a Reel or a Short is playing.

You have to turn this on yourself in Android Settings, and you can turn it off at
any time in the same place.

**What it can see.** Screen content is read in two apps only: Instagram
(`com.instagram.android`) and YouTube (`com.google.android.youtube`). Within
those two apps, it looks for the on-screen signs of a Reels or Shorts player.

Outside those two apps the service asks Android for one thing: a notice when a
different app comes to the front, carrying that app's package name or window
title. It uses this solely to recognise a payment app and switch itself off (see
below). It does not read, and is not sent, the contents of any other app's screen.

**What it does with what it sees.** It increments a timer. Screen contents are
examined in the moment and discarded. Wilt does not record, store, log,
screenshot, or transmit anything it sees. It does not read your messages, your
posts, your account details, or your passwords.

**What it can do.** When you reach your limit, the service navigates away from
the feed. This is why it is permitted to perform gestures.

**Payment apps.** Some UPI and banking apps (Paytm, for example) refuse to make a
payment while any third-party accessibility service is enabled on the phone. So
when one of a fixed list of such apps opens, or any app that hides its screen
from accessibility services, the service turns itself off and Wilt posts a
notification saying so. Nothing is counted until you turn the
service back on, which the app links you to. If you have granted Wilt Usage
access, it reads the phone's recent app-switch events only to notice that you
have left the payment app, so it can turn itself back on; nothing from that is
stored or sent. The list of apps is built into Wilt; no list of the apps on
your phone is collected or sent anywhere.

## Other permissions

- **Display over other apps.** Draws the floating timer pill on top of Instagram
  and YouTube. It shows only your own elapsed time.
- **Internet and network state.** These appear in the app's permission list
  because standard Android app frameworks declare them. Wilt itself makes no
  network requests.
- **Notifications.** One notification only: that Wilt has paused itself for a
  payment app, so you know to turn it back on. Nothing else is ever posted.
- **Alarms and reminders.** Used for a single timer that turns the service back
  on a few minutes after a payment pause, and only on a phone where you have
  granted Wilt that ability with developer tools. Wilt never asks you for it.
- **Vibrate.** Declared by the app framework.

## Children

Wilt is not directed at children and does not knowingly collect any
information from anyone, regardless of age.

## Removing your data

Uninstalling Wilt deletes everything it has stored. Because nothing is held
anywhere else, that is the end of it. You can also clear the app's data from
Android Settings at any time.

## Changes to this policy

If this policy changes, the updated version will be published at this address and
the date at the top will change. If a future version of Wilt ever collects or
transmits data, that change will be described here before it ships.

## Contact

Questions about this policy or about privacy in Wilt:

**rogerantonybuilds@gmail.com**
