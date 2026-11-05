# MSC Ops

MSC Ops is a local-first operations workspace for Mark's MSC at NU Dasmariñas. It is designed to keep the organization's data on the device while bringing tasks, events, creative work, finance, and compliance into one workflow.

## Run locally

```sh
npm install
npm run dev
```

The app binds to `127.0.0.1:3000`. On first run, complete the local setup wizard. For a production build:

```sh
npm run build
npm start
```

## Local data and privacy

By default, the database and provider keyring live in `./data`. Set `MSC_DATA_DIR` to use another local directory. The directory is gitignored. `MSC_DATA_DIR=memory://` is intended for isolated tests.

MSC Ops does not use analytics or telemetry. API keys are encrypted at rest, never returned to the browser, and never included in network activity records. Outbound requests are limited to configured AI provider hosts and loopback services; Settings → Privacy provides Offline mode and an activity log. The local database itself is not encrypted, so enable full-disk encryption (BitLocker, FileVault, or LUKS) on the device.

This project is under active development. Modules beyond setup, settings, and the initial workspace shell are placeholders.
