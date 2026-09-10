# Hailite Manager 1.0.0 — release checklist

This separates work that can be completed in the repository from actions that require the future store-owner account. “Ready to submit” is not the same as guaranteed store approval or legal certification.

## Completed in the repository

- [x] Stable Android application ID: `ca.hailite.manager`.
- [x] Android target and compile SDK 36; minimum SDK 24. This meets the Google Play requirement in force since August 31, 2026 for new apps and app updates.
- [x] Bundled Capacitor application; no production remote WebView URL.
- [x] HTTPS-only Android networking and disabled Android data backup.
- [x] Location, camera, and microphone declared without background location or broad storage permission.
- [x] Location permission deferred until the workforce notice has been accepted.
- [x] Native session token returned only to an identified native client and held in memory.
- [x] Web sessions remain in secure HttpOnly cookies.
- [x] Public bilingual privacy policy, terms, and account-deletion instructions.
- [x] PWA manifest and offline shell for installation outside an app store.
- [x] Store icon, feature graphic, listing copy, and Data safety draft.
- [x] Automated Web verification and Android APK/AAB build workflow.
- [x] Confined store-review profile: an account flagged `is_review_account` signs in normally, lands on the built-in five-year fictional dataset, and is refused every company-data route by the server (`reviewAccount.ts`), so a reviewer can exercise the whole app without seeing real jobs, employees, or pay rates. The database forbids giving it an expiry date.
- [x] Manual signed-release workflow: `.github/workflows/android-release.yml` builds a versioned release AAB, verifies its signature, and publishes the AAB plus its SHA-256 as protected GitHub Actions artifacts. Signing material remains outside the repository.

## Must be completed by the owner before sale

- [ ] Create the Google Play Console owner account and complete identity/business verification.
- [ ] Choose the correct account type. Do not claim to be an organization unless the business meets Google’s organization requirements.
- [ ] Confirm that the package `ca.hailite.manager` is registered to the developer in Play Console. Google is introducing Android developer verification package registration and requires Play packages to be registered by **September 30, 2026**; eligible Play apps may be auto-registered, but the Console Home page must still be checked.
- [ ] If using a newly created personal account (created after November 13, 2023), plan the required closed test: at least 12 opted-in testers continuously for 14 days before applying for production access.
- [x] Commercial model chosen: **paid download**, a single price set in the console. Google handles the Play purchase, so no Google Play Billing library is required for the download price and none is present in the app.
- [ ] Set up the Google Payments merchant profile. A paid app cannot be published for sale without the required payments setup, and it is verified separately from the developer account, so start it early.
- [ ] Keep the app free of any other digital sale unless Play Billing requirements are implemented. Adding a subscription, an in-app unlock, or an outside payment path for digital app functionality changes the billing-policy analysis. Invoicing a construction client for physical work done is not the sale of digital app content.
- [ ] Note that Google no longer offers a built-in trial for paid apps. The separate trial build in this repository (`.env.trial`) is how a prospect tries the app; it is distributed outside the store and must never be sold.
- [ ] Create the upload keystore once, store it in two secure backups, and never commit it. Its signing certificate must remain valid long enough for future updates (Android guidance requires a validity period ending after October 22, 2033).
- [ ] Add these four GitHub Actions repository secrets before using the signed-release workflow:
  - `ANDROID_UPLOAD_KEYSTORE_BASE64` — base64 of the upload `.jks` file;
  - `ANDROID_UPLOAD_STORE_PASSWORD` — keystore password;
  - `ANDROID_UPLOAD_KEY_ALIAS` — upload-key alias;
  - `ANDROID_UPLOAD_KEY_PASSWORD` — key password.
- [ ] Enrol in Play App Signing. For a new Play app, Google Play App Signing is the normal signing path; the developer still signs the uploaded AAB with the separate upload key.
- [ ] Enter the final privacy, Data safety, target-audience, content-rating, ads, and account-deletion declarations.
- [ ] Create the review profile, then fill in **App access**. Every screen of this app sits behind a PIN, so a reviewer who is given nothing sees only the login list and cannot test anything. Run `supabase/create-review-account.sql` against the production database, changing the example PIN first, then give Google that profile name and PIN and state that no other step is required to reach the app. The profile is confined: it opens on the built-in five-year fictional dataset, and the server refuses it every company-data route, so the reviewer never sees real jobs, employees, or pay rates. It cannot be given an expiry date — the database rejects that combination, because the review would otherwise fail on the day it lapsed. Keep the profile for as long as the app is published: Google can re-review on any update.
- [ ] Verify that `info@hailitexteriors.ca` exists and is actively monitored, or replace it everywhere before submission.
- [ ] Have the privacy policy, terms, payroll/tax wording, and retention periods reviewed for the actual countries sold into.
- [ ] Test the release on at least one low-end Android 7/8 device or emulator and one current Android 16 device, plus the owner’s Samsung device. On the Android 15+ device, confirm the clock and battery do not sit on top of the header, and that the bottom bar clears the gesture bar: from API 35 the system draws the app under both bars.
- [ ] Run the closed/internal track, collect consented tester feedback, fix crashes, then promote the exact tested AAB.

## How to produce the Play-ready signed AAB

1. Create the upload key locally with `keytool` or Android Studio. Never send the private `.jks` in chat and never commit it.
2. Put the four values above into **GitHub → repository Settings → Secrets and variables → Actions**.
3. Open **Actions → Android signed release → Run workflow**.
4. Enter a `versionCode` greater than every version already uploaded to Play and the desired `versionName`.
5. The workflow runs typecheck, lint, tests, store validation, the mobile build, Android lint/tests, then `bundleRelease` with the protected key.
6. It runs `jarsigner -verify` on the finished bundle and creates `app-release.aab.sha256`.
7. Download the `hailite-manager-v<version>-signed-aab` artifact and upload that exact AAB to a Play testing track first.

## Repeat for every release

1. Choose a new `versionCode` greater than the previous Play upload and set the intended `versionName` in the signed-release workflow. The repository defaults remain `1` / `1.0.0` for ordinary verification builds.
2. Run `npm ci`, `npm run store:validate`, the complete test suite, Web build, and Android workflow.
3. Review dependency and secret scans; inspect the Android merged manifest.
4. Install the generated debug APK and exercise onboarding, every role, login/logout, GPS allowed/denied, camera, files, voice, offline recovery, backup/export, deletion, and both languages.
5. Run **Android signed release** and verify the workflow passes signature verification before uploading its AAB.
6. Update screenshots, release notes, Data safety answers, and policy version when behaviour changes.
7. Upload to a testing track first and wait for all automated/pre-launch reports before production.

## Official references checked on September 9, 2026

- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Android developer verification / package registration: https://support.google.com/googleplay/android-developer/answer/16984799
- Testing requirements for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Data safety / user data: https://support.google.com/googleplay/android-developer/answer/10144311
- App content / reviewer access: https://support.google.com/googleplay/android-developer/answer/9859455
- App creation and versionCode: https://support.google.com/googleplay/android-developer/answer/9859152
- Play App Signing: https://support.google.com/googleplay/android-developer/answer/9842756
- Android release signing: https://developer.android.com/studio/publish/preparing
- Android App Bundle: https://support.google.com/googleplay/android-developer/answer/9844679
