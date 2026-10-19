# Security Policy

Mujic is an offline-first music player and progressive web app (PWA), with an optional online music workspace. This policy explains which versions receive security fixes and how to report a vulnerability responsibly.

## Supported Versions

Security fixes are generally made to the latest version of Mujic available in the official repository:

- **Latest release:** Supported
- **Older releases:** Not guaranteed to receive security fixes; update to the latest release before reporting an issue where possible.

The optional backend/proxy is deployed separately from the frontend. A fix in this repository does not necessarily mean the live backend has been updated; backend deployments must be reviewed and updated independently.

## Reporting a Vulnerability

**Please do not publish security vulnerabilities in a public GitHub issue, discussion, pull request, or social post before the maintainer has had a chance to investigate.**

1. Open the repository's **Security** tab: <https://github.com/royverse69/mujic/security>.
2. If **Report a vulnerability** / private vulnerability reporting is available, use it to send a private report.
3. If private reporting is unavailable, contact the repository maintainer privately through their GitHub profile: <https://github.com/royverse69>. Share only enough information to establish contact and ask for a private channel; do not disclose exploit details publicly.

Please include, where possible:

- A clear description of the suspected vulnerability and its potential impact.
- The affected version, file, endpoint, browser, or deployment.
- Reproducible steps or a minimal proof of concept.
- Any relevant logs or screenshots, after removing personal information, access tokens, API keys, and other secrets.
- Whether the issue affects the PWA, the optional backend/proxy, or both.

Please make a good-faith effort to avoid accessing other people's data, disrupting the service, or exposing the vulnerability to anyone beyond what is necessary to report it.

## What to Expect

The maintainer will review the report, may ask for additional details, and will work to assess the impact and determine an appropriate fix. Please allow reasonable time for investigation and remediation. There is currently **no guaranteed response or remediation SLA**.

If a report is accepted, the maintainer may coordinate disclosure after a fix or mitigation is available. Please do not assume a report is confirmed until the maintainer has reviewed it.

## Security Scope and Notes

The following areas are relevant to Mujic security reports:

- **PWA/frontend:** JavaScript, HTML, CSS, service-worker caching, client-side storage, and handling of imported or downloaded content.
- **Local data:** Music files, playlists, settings, artwork, cached metadata, lyrics, and history stored by the browser. Browser storage is not a substitute for device-level protection and may be accessible to someone who can use the same browser profile or device.
- **Optional online workspace:** Requests to the configured catalogue/lyrics services and third-party providers, including how URLs and responses are validated and handled.
- **Optional backend/proxy:** Allowlisting, redirect handling, request validation, media proxying, error handling, and unintended disclosure of server-side information.
- **Build and dependency configuration:** Vulnerabilities in dependencies, scripts, or release artifacts that can realistically affect users.

Mujic's online workspace necessarily contacts remote services. Those services may receive request information such as search terms, track or artist identifiers, requested media URLs, IP address, and ordinary connection metadata. Their handling of that information is governed by their own policies. Do not send passwords, private keys, or other secrets in a vulnerability report unless absolutely necessary; redact them first.

If you use any optional API-key feature, treat keys stored in browser-side storage as accessible to the browser profile and anyone able to inspect it. Do not use a secret that must remain confidential in client-side code. Never commit API keys, tokens, passwords, private URLs, or production credentials to this repository.

## Out of Scope

Unless a concrete security impact is demonstrated, the following are generally not treated as security vulnerabilities:

- General bugs, playback problems, feature requests, or visual/UI issues without a security impact.
- Vulnerabilities solely in third-party services that Mujic does not operate. These should be reported to the relevant service, though Mujic-specific unsafe handling may still be in scope.
- Issues requiring a user to run a deliberately modified or untrusted copy of the application, unless the issue also affects the official release or normal usage.
- Reports based only on automated scanner output without a practical impact or reproducible evidence.

This list is guidance, not a reason to ignore a credible report with a demonstrated impact.

## Safe Testing

Test only systems and accounts you own or have explicit permission to assess. Do not perform destructive testing, denial-of-service attacks, social engineering, or tests that access, modify, or expose other users' data. Stop testing and report the issue if you encounter sensitive data.

Thank you for helping keep Mujic and its users safer.
