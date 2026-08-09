# Google Play Data safety — working declaration

Status: technical draft for version 1.0.0. Reconfirm every answer in Play Console after the final production SDK and processor review. Google considers data handled by third-party SDKs and service providers part of the declaration.

## High-level answers

| Play Console question | Draft answer | Basis |
|---|---|---|
| Does the app collect or share required user data types? | Yes, collects | Business records are sent to the configured cloud when cloud mode is selected. |
| Is all user data encrypted in transit? | Yes | Production API and providers use HTTPS/TLS; Android blocks cleartext traffic. |
| Can users request deletion? | Yes | In-app administrator deletion plus the public deletion-request page. |
| Does the app contain ads? | No | No advertising SDK or behavioural advertising. |
| Is data sold? | No | No sale of personal information. |
| Is location collected in the background? | No | Only foreground checks initiated for punch/geotag features. |

## Data types

“Shared” is marked **No — service-provider processing only** on the current architecture. Verify the contracts and configuration of Supabase, Vercel, and each enabled AI provider before submission; change the Play answer if any use falls outside Google’s service-provider exception.

| Google Play category | Collected | Shared | Required | Purposes and app feature |
|---|---:|---:|---:|---|
| Name | Yes | No* | For business profiles | Account management, crew and customer records, documents. |
| Email address | Yes | No* | For applicable profiles | Account/contact management and business documents. |
| Phone number | Yes | No* | Optional | Workforce, customer, vendor, and emergency contact records. |
| Address | Yes | No* | Optional | Customer, company, employee, and job records. |
| User IDs | Yes | No* | Yes | Authentication, authorization, and record ownership. |
| Other personal info | Yes | No* | Optional | Role, worker type, qualifications, signatures, and company-entered records. |
| Financial info | Yes | No* | Feature-dependent | Pay rates, payroll records, expenses, invoices, taxes, and payment details entered by the business. |
| Precise location | Yes | No* | Optional | Foreground punch proximity and optional job-photo geotag. No background collection. |
| Approximate location | Yes | No* | Optional | Same foreground features when only coarse permission is granted. |
| Photos | Yes | No* | Optional | Profile images, job photos, claims, and document attachments. |
| Files and documents | Yes | No* | Optional | Contracts, invoices, credentials, safety and project documents. |
| Other user-generated content | Yes | No* | Optional | Notes, descriptions, tasks, signatures, prompts, and AI assistant attachments. |
| App interactions | Limited | No* | Security/operation | Authorized actions and audit-related business events; no advertising profile. |
| Crash logs / diagnostics | Yes | No* | Automatic | Reliability, security, and troubleshooting through hosting logs. |
| Device or other identifiers | Yes | No* | Automatic | IP/device-related request information used for security and service delivery. |
| Contacts from the device address book | No | No | — | The app stores contacts typed by users but does not read the device contacts list. |
| Audio / voice recordings | Yes (potentially ephemeral) | No* | Optional | User-initiated voice input may transmit speech to the device/browser recognition service for real-time transcription. Hailite Manager does not retain the raw recording as a business record. Confirm the final Android speech provider and mark ephemeral processing in Play Console when applicable. |
| Browsing history, health, fitness, messages, calendar | No | No | — | No direct device collection for these Play categories in version 1.0.0. |

`*` Data is processed by contracted infrastructure and, only when an authorized administrator invokes it, the configured AI provider. This draft treats those transfers as service-provider processing rather than “sharing”; the final console declaration must match the signed terms and real deployment.

## Retention and deletion

- Configurable default business-record retention: 84 months, subject to the customer’s legal obligations.
- Session token lifetime: 4 hours; the mobile token is kept only in application memory and cleared on logout/app termination.
- Deletion path in app: authorized administrator removes the relevant employee/user profile and associated records as allowed by the business workflow.
- External deletion URL: `https://hailite-manager.vercel.app/account-deletion.html`.
- Some payroll, tax, safety, contractual, or evidentiary records may be isolated and retained where legally required.

## Final pre-submission confirmations

- [ ] Verify the public privacy and deletion URLs without authentication.
- [ ] Verify the support mailbox `info@hailitexteriors.ca` is monitored.
- [ ] Review the final Android merged manifest and every production dependency.
- [ ] Confirm the selected AI provider and its data-processing/retention settings.
- [ ] Confirm whether the final Android speech-recognition service transmits voice off device and whether its processing qualifies as ephemeral.
- [ ] Confirm Supabase and Vercel production regions, logging, retention, and contracts.
- [ ] Make the Play Console answers identical to this final verified behaviour.
