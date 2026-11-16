// Cloudflare adapter settings. Every page is rendered per request (signed-in data),
// so no incremental cache (R2) is needed.
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({})
