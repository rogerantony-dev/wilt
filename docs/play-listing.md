# Play Console submission notes

Copy for the store listing and, more importantly, the answers to the forms that
decide whether an app in this category gets approved. Everything here is drawn
from what the code actually does, so keep it in sync if the behaviour changes.

Package: `com.rogerantony.wilt`

---

## Permissions Declaration: Accessibility API

This is the form that matters. Play restricts `AccessibilityService` to
accessibility uses unless you declare and justify a different one. Answer it
carefully and specifically. Vagueness reads as evasion.

**Which permission:** Accessibility API (`BIND_ACCESSIBILITY_SERVICE`)

**Is your app an accessibility tool?** No. The service is declared in the app as
`android:isAccessibilityTool="false"`.

**What is the core functionality that requires it:**

> Wilt is a screen-time tool that helps people cut down on short-form video.
> Its core function is to measure how long the user spends on Instagram Reels and
> YouTube Shorts, show that time back to them live, and block those feeds once
> they pass a daily limit they set themselves.
>
> The Accessibility API is the only mechanism on Android that lets an app
> determine that a Reels or Shorts player is currently on screen inside another
> app. Android provides no other API for this. Usage-stats APIs report only which
> app is in the foreground, which cannot distinguish watching Reels from reading
> direct messages inside Instagram, so the app cannot perform its core function
> without this permission.
>
> Screen content is read in two apps only, `com.instagram.android` and
> `com.google.android.youtube`. There the service uses it to increment a timer
> and, at the limit, to navigate away from the feed. Screen content is evaluated
> in the moment and discarded. Nothing is recorded, stored, logged, or
> transmitted, and the app makes no network requests at all.
>
> Outside those two apps the service subscribes only to window-switch events
> (TYPE_WINDOW_STATE_CHANGED and TYPE_WINDOWS_CHANGED), which carry the package
> name or window title of the app coming to the front. It uses that for one
> purpose: some UPI and banking apps refuse to run while any third-party
> accessibility service is enabled, so when such an app comes to the front the
> service disables itself (AccessibilityService.disableSelf) and notifies the
> user, who re-enables it afterwards. No content of any other app is read.

**How users are told, before enabling it:** The onboarding flow has a dedicated
screen explaining both permissions before either is requested. Its wording:
"This is how Wilt sees Reels and floats the timer. It only reads Instagram and
YouTube, nothing else, and your data stays on this device." The service also
carries an `android:description` shown in Android's own accessibility settings.

**Video demo:** Play asks for a link to a short video showing the prominent
disclosure and the feature in use. Recorded 6 September 2026 as
`docs/store/wilt-demo.mp4` (72 s, 1080x2340). Upload it unlisted to YouTube and
paste the link into the declaration.

What it shows, in order: the onboarding tour, the permissions page with the
disclosure ("This is how Wilt sees Reels and floats the timer. It only reads
Instagram and YouTube, nothing else, and your data stays on this device"),
tapping through to Android's Accessibility settings, Installed apps, the Wilt
Reel Counter page with the system-shown description, the switch and the "Allow
Wilt Reel Counter to have full control" dialog, back to the dashboard, then
Instagram Reels with the floating timer counting.

Re-record it whenever the onboarding copy or the service description changes.

---

## Data Safety form

Answers consistent with the code as of this commit.

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** |
| Is all user data encrypted in transit? | N/A, no data is transmitted |
| Do you provide a way for users to request data deletion? | Uninstalling removes all data; no server-side data exists |

Notes if challenged: the app stores usage counts, limits, streaks, and unlocked
images in private app storage. This is not "collection" under Play's definition
because it is never transmitted off the device. Automatic Android backup is
disabled (`android:allowBackup="false"`), so app data is not copied to Google
Drive either.

`INTERNET` and `ACCESS_NETWORK_STATE` appear in the manifest because standard
app frameworks declare them. The app makes no network requests. Describe what the
app does, not what it is incapable of.

---

## Content rating

- Category: Utility / Productivity
- No violence, sexual content, profanity, gambling, or drug references
- No user-generated content, no social features, no chat
- Does not share location
- The app displays cat photographs bundled in the APK

Expected outcome: rated for everyone.

---

## Target audience

- Target age group: 18+ (or 13+ if you prefer, nothing in the app is age-gated)
- Not designed for children, not appealing primarily to children
- No ads

---

## Store listing copy

**App name (30 chars max)**

```
Wilt
```

**Short description (80 chars max)**

```
Time your Reels and Shorts, or wall them off. A quiet screen-time app.
```

**Full description (4000 chars max)**

```
Short-form video is designed to take your time without you noticing. Wilt
makes that time visible, then helps you stop.

WATCH THE CLOCK RUN DOWN
Wilt counts the minutes you spend on Instagram Reels and YouTube Shorts. A
floating timer sits on top of the feed while you scroll, so the cost is never
hidden. On your home screen a cat keeps the time, and it wilts as the minutes
climb: fresh in the morning, a skull once you are past your limit.

TWO WAYS TO USE IT
Guilt mode times your scrolling and blocks the feeds once you hit a daily limit
you choose. Block mode walls off Reels and Shorts entirely, from the moment you
open the app.

AN INTERRUPTION THAT IS NOT A LECTURE
When you have been scrolling a while, Wilt interrupts with a cat to look at
instead of the feed. Keep going if you want. It is a pause, not a punishment.

SEE YOUR WEEK
A home-screen widget and a history screen show the pattern over days, so you can
tell whether it is actually getting better.

BUILT TO STAY OUT OF THE WAY
No account. No sign-up. No ads. No analytics. Wilt makes no network requests
at all, and everything it records stays in your phone's private storage.

HOW IT WORKS
Wilt uses Android's accessibility service to tell when a Reel or a Short is on
screen. That is the only way an Android app can know this. It reads screen
content only inside Instagram and YouTube, nothing else on your phone, and what it sees
is counted and discarded, never stored or sent anywhere. You turn it on yourself
during setup and can turn it off at any time in Android Settings.
```

---

## Graphics

Generated by `node design-previews/gen-store-assets.js`, output in
`design-previews/out-store/`:

- `play-icon-512.png`, 512x512, no alpha
- `feature-graphic.png`, 1024x500, no alpha

**Screenshots** are captured, in `docs/store/play/` alongside copies of the two
graphics above. All seven are 1080x1920, exactly the 9:16 Play asks for, with no
alpha and none over 8 MB. A raw device screenshot is about 9:19.5, outside Play's
accepted range, so each one is scaled to fit and centred on the app's own canvas
colour rather than cropped, which keeps the whole UI visible.

Suggested upload order, since the first two or three carry the listing:

1. `1-dashboard.png` — time spent, budget left, the mode switch
2. `4-block-mode.png` — the other mode
3. `2-cats.png` — the reward, and the most visually distinctive screen
4. `3-history.png` — the pattern over days
5. `7-limit-picker.png` — that the limit is the user's choice

`5-ig-cover.png` (the blanked feed) and `6-nudge.png` (an interruption card) are
the clearest demonstrations of what the app actually does, but both show
Instagram's wordmark and navigation bar. That is fine and necessary in the review
video, which reviewers see privately. On a public listing, third-party branding
is a known trigger for impersonation and IP review, so treat those two as
optional and be ready to drop them if the listing gets flagged.

Regenerate the screenshots with `docs/store/` as the working directory; the
conversion is a scale-and-pad to 1080x1920 with the status bar cropped at row 110.

---

## Privacy policy URL

Paste this into Play Console > App content > Privacy policy, and into the
store listing:

```
https://rogerantony-dev.github.io/wilt/
```

Served by GitHub Pages from the `gh-pages` branch of this repo, which holds
only `index.html` and `.nojekyll`. The internal design docs under `docs/` are
deliberately not published as site pages.

`docs/privacy-policy.md` is the source of record for the wording. The published
page is a hand-maintained HTML copy of it, so **if the policy changes, update
both** and bump the date in each.

---

## Release checklist

- [x] Privacy policy hosted at a public URL
- [x] Store graphics generated (icon, feature graphic)
- [x] Phone screenshots captured and converted to 9:16 (recaptured as Wilt on
      6 September 2026; the nudge shot is missing and `docs/screenshots/`
      still has three Unhook-era images: limit reached, the widget, the pill)
- [x] Demo video re-recorded as Wilt, showing the disclosure and the Settings toggle
- [x] EAS project relinked under the `wilt` slug (`@rogerantony/wilt`)
- [ ] Complete **Android developer verification**, or publishing is blocked
- [ ] Build a signed AAB: `eas build --platform android --profile production --non-interactive`
      (first build started 6 September 2026; signing uses the local upload key, see below)
- [ ] Upload `docs/store/wilt-demo.mp4` to YouTube as unlisted, keep the link
- [ ] Complete Data Safety, content rating, target audience
- [ ] Submit the Accessibility API Permissions Declaration with the video link
- [ ] Run **closed testing**: 12+ testers opted in for 14 continuous days
- [ ] Apply for production access, then promote once review passes

Do not upload a locally built APK; Play wants the AAB from EAS. Local release
builds are signed with the same upload key when it is present on the machine
(`plugin/withReleaseSigning.js`), so the GitHub APKs stay installable on
certified devices after the September 2026 developer-verification deadline.
The upload key's fingerprint must be registered under Wilt in Play Console >
Android developer verification (the three keys Google lists there are its own;
add this one). The Play upload key is a separate keystore at
`~/.wilt/upload.keystore` (password in `~/.wilt/upload.password`, alias
`upload`), handed to EAS through `credentials.json` in the repo root, which is
gitignored, with `credentialsSource: local` in `eas.json`. Back up both files
in `~/.wilt`; Play App Signing holds the real app signing key, so a lost upload
key can be reset from Play Console > App integrity, but it is a support ticket.
Upload key SHA-256:
`23:31:AE:2A:C3:58:D4:89:40:97:EE:05:8C:41:37:08:1E:61:BF:C3:D9:F7:9C:CF:AE:B7:E3:2D:30:3B:2A:E2`.

**The 12-tester rule is the long pole.** Personal developer accounts created after
13 November 2023 cannot publish to production until they have run a closed test
with at least 12 testers opted in for 14 continuous days, and then been granted
production access. Plan for two weeks minimum, and upload the first build to
**closed** testing rather than internal, because internal testing does not count
toward the 14 days.
