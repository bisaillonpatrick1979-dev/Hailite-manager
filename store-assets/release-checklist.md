# Hailite Manager 1.0.0 — release checklist

This separates work that can be completed in the repository from actions that require the future store-owner account. “Ready to submit” is not the same as guaranteed store approval or legal certification.

## Completed in the repository

- [x] Stable Android application ID: `ca.hailite.manager`.
- [x] Android target and compile SDK 36; minimum SDK 24.
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

## Must be completed by the owner before sale

- [ ] Create the Google Play Console owner account and complete identity/business verification.
- [ ] Choose the correct account type. Do not claim to be an organization unless the business meets Google’s organization requirements.
- [ ] If using a newly created personal account, plan the required closed test: at least 12 opted-in testers continuously for 14 days before production access.
- [ ] Choose the commercial model before publishing: paid download, free trial, subscription, or business licence. Subscriptions and digital in-app purchases require Google Play Billing implementation and testing.
- [ ] Create the upload keystore once, store it in two secure backups, and never commit it.
- [ ] Enrol in Play App Signing and keep the upload key separate from the app-signing key.
- [ ] Enter the final privacy, Data safety, target-audience, content-rating, ads, and account-deletion declarations.
- [ ] Verify that `info@hailitexteriors.ca` exists and is actively monitored, or replace it everywhere before submission.
- [ ] Have the privacy policy, terms, payroll/tax wording, and retention periods reviewed for the actual countries sold into.
- [ ] Test the release on at least one low-end Android 7/8 device or emulator and one current Android 16 device, plus the owner’s Samsung device.
- [ ] Run the closed/internal track, collect consented tester feedback, fix crashes, then promote the exact tested AAB.

## Repeat for every release

1. Increment `versionCode` and `versionName`.
2. Run `npm ci`, `npm run store:validate`, the complete test suite, Web build, and Android workflow.
3. Review dependency and secret scans; inspect the Android merged manifest.
4. Install the generated debug APK and exercise onboarding, every role, login/logout, GPS allowed/denied, camera, files, voice, offline recovery, backup/export, deletion, and both languages.
5. Build and sign the release AAB with the protected upload key.
6. Update screenshots, release notes, Data safety answers, and policy version when behaviour changes.
7. Upload to a testing track first and wait for all automated/pre-launch reports before production.

## Official references checked on 8 August 2026

- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Testing requirements for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Privacy policy: https://support.google.com/googleplay/android-developer/answer/10144311
- App signing: https://developer.android.com/studio/publish/app-signing
- Android App Bundle: https://developer.android.com/studio/publish/upload-bundle
