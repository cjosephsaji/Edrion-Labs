# Local OCR runtime handoff

This continuation keeps the original Petros artwork and addresses source preparation. The previous OCR adapter accepted only a Homebrew installation at `/opt/homebrew/Cellar/tesseract/`; that installation is absent on this host. This caused the missing `Gateway` receipt and five dependent source-test failures. No source expectations were removed.

A separate Tesseract 5.5.1 environment was provisioned at `/private/tmp/petros-m6-ocr-runtime` using conda-forge packages and the official standalone micromamba distribution. The downloaded micromamba archive matched the registry SHA-256. Package builds, hashes and public download URLs are retained in `ocr-runtime-packages.json`; the bootstrap receipt is `micromamba-receipt.json`. No system installation, shell initialization, repository dependency change, credential-bearing source request or paid provider call was made. See the [official micromamba installation documentation](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html) and [Tesseract installation documentation](https://tesseract-ocr.github.io/tessdoc/Installation.html).

The new runtime configuration is optional and explicit. Both environment variables must be set:

```sh
PETROS_LOCAL_OCR_MANIFEST='/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m6-functional-20261021/ocr-runtime-manifest.json'
PETROS_LOCAL_OCR_MANIFEST_SHA256=991d40ffb97cc45fff08c0d8d1c3e70c4fe4cf2345164f4c406e2593b7fbb51a
```

The pair is supplied only to the isolated verification commands. No application `.env` or global shell setting was edited. Unconfigured instances retain the existing Homebrew path and blocked/partial fallback if unavailable. These artifacts are a local engineering runtime, not a durable deployed installation.

The manifest pins the engine, English trained data and 35 private dylibs. Before dispatch, the adapter checks the manifest hash, asset hashes, path containment, symlink targets, library aliases and unlisted private libraries. The sandbox permits literal reads of the pinned private libraries, the engine, its English data and existing macOS system libraries. It does not grant the whole runtime prefix access. Missing or mismatched configuration blocks OCR; it never silently accepts another executable from PATH.

The existing five-second wall, three-second CPU, 256 MiB RSS, 500 KB output and single-thread limits remain unchanged. The child receives an explicit credential-free environment and no network permission. A compiled synthetic native probe verified outside-file denial, loopback denial and absence of a parent environment sentinel in the actual macOS sandbox. The probe is security test code; it is not presented as genuine OCR output. Separate tests read real fixture pixels with the real Tesseract engine.

To pin an already provisioned runtime into a **new** manifest, run from the API workspace:

```sh
node scripts/pin-petros-local-ocr-runtime.mjs \
  /private/tmp/petros-m6-ocr-runtime \
  /absolute/path/to/new-manifest.json \
  5.5.1
```

The generator refuses to overwrite an existing manifest and prints its SHA-256. Regenerating the current manifest produced the identical digest. Deleting or moving the temporary prefix requires explicit reprovisioning and a new reviewed pin; it does not select a fallback unqualified executable.

OCR receipts remain uncalibrated, review-required source transcriptions. Recovering a label does not establish diagram edges, answer correctness, academic meaning or learner mastery. Production runtime ownership, immutable provisioning, comprehensive Office/OCR escape/load qualification and source/academic approval remain separate gates.
