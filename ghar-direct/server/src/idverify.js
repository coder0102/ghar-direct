'use strict';

// ID check providers.
//
// A provider is an object with one method:
//   start(user, input) -> { status: 'verified' | 'pending' | 'failed', reference?: string }
//
// "stub" approves everyone immediately. It exists so you can test the whole app. DO NOT launch with it.
//
// To plug in a real provider (for example a KYC service that checks a government ID and a selfie):
//   1. Add a file like src/providers/yourprovider.js that exports { start }.
//   2. Register it in the PROVIDERS map below.
//   3. Set ID_PROVIDER=yourprovider in the environment.
// If your provider answers later (a webhook), return status "pending" from start() and set
// users.id_status to "verified" when the webhook arrives.

const stub = {
  name: 'stub',
  async start(user) {
    return { status: 'verified', reference: `stub-${user.id}` };
  },
};

const PROVIDERS = { stub };

function getIdProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown ID_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  return p;
}

module.exports = { getIdProvider, PROVIDERS };
