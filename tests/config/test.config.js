export const testRuntimeConfig = {
  eventVerifyMode: process.env.EVENT_VERIFY_MODE || 'local',
  bridgeSyncTimeoutMs: Number(process.env.BRIDGE_SYNC_TIMEOUT_MS || 60000),
  bridgeSyncPollMs: Number(process.env.BRIDGE_SYNC_POLL_MS || 2000),
  /** @deprecated use eventVerifyMode=local */
  skipBridgePoll:
    process.env.SKIP_BRIDGE_POLL === '1' ||
    (process.env.EVENT_VERIFY_MODE || 'local') === 'local',
  preferredProviderType: process.env.TEST_PROVIDER_TYPE || 'default_auto'
};
