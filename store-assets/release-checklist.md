# Hailite Manager 1.0.0 — release checklist

This separates work that can be completed in the repository from actions that require the future store-owner account. “Ready to submit” is not the same as guaranteed store approval or legal certification.

## Completed in the repository

- [x] Stable Android application ID: `ca.hailite.manager`.
- [x] Android target and compile SDK 36; minimum SDK 24. This meets the Google Play requirement in force since August 31, 2026 for new apps and app updates.
- [x] Bundled Capacitor application; no production remote WebView URL.
- [x] HTTPS-only Android networking and disabled Android data backup.
- [x] Location, camera, and microphone declared without background location or broad storage permission.
- [x] Location requires the current workforce notice and an explicit user action; no request on app launch. Photo geotagging is unchecked by default.
- [x] Native session token returned only to an identified native client and held in memory.
- [x] Web sessions remain in secure HttpOnly cookies.
- [x] Public bilingual privacy policy, terms, and account-deletion instructions.
- [x] PWA manifest and offline shell for installation outside an app store.
- [x] Store icon, feature graphic, listing copy, and Data safety draft.
- [x] Automated Web verification and Android APK/AAB build workflow.
- [x] Every authenticated request rechecks account existence, active status, current role and access expiry; deleted/disabled accounts cannot keep using a previously issued token.
- [x] In-app AI reporting with acknowledged durable storage and a moderation runbook.
- [x] Inspection of the merged Android manifest and actual AAB, including native libraries from dependencies.
- [x] Manual signed-release workflow: `.github/workflows/android-release.yml` builds a versioned release AAB, verifies its signature, and publishes the AAB plus its SHA-256 as GitHub Actions artifacts. The `google-play-release` environment and upload-key secrets still need owner configuration. Signing material remains outside the repository.

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
- [ ] Configure required reviewers and allowed branches on the `google-play-release` GitHub environment, then add these four Actions secrets:
  - `ANDROID_UPLOAD_KEYSTORE_BASE64` — base64 of the upload `.jks` file;
  - `ANDROID_UPLOAD_STORE_PASSWORD` — keystore password;
  - `ANDROID_UPLOAD_KEY_ALIAS` — upload-key alias;
  - `ANDROID_UPLOAD_KEY_PASSWORD` — key password.
- [ ] Enrol in Play App Signing. For a new Play app, Google Play App Signing is the normal signing path; the developer still signs the uploaded AAB with the separate upload key.
- [ ] Enter the final privacy, Data safety, target-audience, content-rating, ads, financial-features and account-deletion declarations. Include optional AI reports and the actual processors.
- [ ] Assign an operator to review AI content reports and handle deletion requests; follow `google-play/audit-2026-09-09.md`.
- [ ] Verify the full purchase-to-onboarding flow for an unrelated company: `.env.mobile` currently points to the existing Hailite server; public cloud onboarding is not a self-service multi-company provisioning flow.
- [ ] Fill in **App access**. Every screen of this app sits behind a PIN, so a reviewer who is given nothing sees only the login list and cannot test anything. Reviews are refused for exactly this. Supply an isolated reviewer organization with fictitious records and working credentials for each restricted role. Credentials must remain valid without expiry, OTP, geographic restrictions or human intervention. Describe the full sign-in and setup steps in English. Never give reviewers access to real workforce or customer records. If that demo profile is given a guest expiry date, the review fails the day it lapses.
- [ ] Verify that `info@hailitexteriors.ca` exists and is actively monitored, or replace it everywhere before submission.
- [ ] Have the privacy policy, terms, payroll/tax wording, and retention periods reviewed for the actual countries sold into.
- [ ] Test the release on at least one low-end Android 7/8 device or emulator and one current Android 16 device, plus the owner’s Samsung device. On the Android 15+ device, confirm the clock and battery do not sit on top of the header, and that the bottom bar clears the gesture bar: from API 35 the system draws the app under both bars.
- [ ] Run the closed/internal track, collect consented tester feedback, fix crashes, then promote the exact tested AAB.

## How to produce a signed AAB for Play testing

1. Create the upload key locally with `keytool` or Android Studio. Never send the private `.jks` in chat and never commit it.
2. Put the four values above into **GitHub → repository Settings → Environments → google-play-release → Environment secrets**.
3. Open **Actions → Android signed release → Run workflow**.
4. Enter a `versionCode` greater than every version already uploaded to Play and the desired `versionName`.
5. The workflow runs typecheck, lint, tests, store validation, the dependency audit, artifact-validator tests, the mobile build, Android lint/tests, then `bundleRelease` with the protected key.
6. It inspects the final merged manifest and AAB, runs `jarsigner -verify`, and creates `android-artifact-report.json` plus `android-aab.sha256`.
7. Download the `hailite-manager-play-<version_code>` artifact and upload that exact AAB to a Play testing track first.

## Repeat for every release

1. Choose a new `versionCode` greater than the previous Play upload and set the intended `versionName` in the signed-release workflow. The repository defaults remain `1` / `1.0.0` for ordinary verification builds.
2. Run `npm ci`, `npm run store:validate`, the complete test suite, Web build, and Android workflow.
3. Review dependency and secret scans; inspect the Android merged manifest.
4. Install the generated debug APK and exercise onboarding, every role, login/logout, GPS allowed/denied, camera, files, voice, offline recovery, backup/export, deletion, and both languages.
5. Run **Android signed release** using an unused versionCode, or `npm run android:release`; verify with `python3 scripts/verify-android-artifact.py --require-signed`. The unsigned CI AAB is not a submission artifact.
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
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- App signing: https://developer.android.com/studio/publish/app-signing
- Android App Bundle: https://developer.android.com/studio/publish/upload-bundle
- AI content: https://support.google.com/googleplay/android-developer/answer/13985936
- Payments: https://support.google.com/googleplay/android-developer/answer/9858738
- 16 KB pages: https://developer.android.com/guide/practices/page-sizes
