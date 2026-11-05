// Writes the TypeScript template definitions out as JSON for the seed script and the admin area.
import { writeFileSync } from "node:fs";
import { HEALTH_CHECK_TEMPLATE } from "../lib/templates/health-check-v1.ts";
import { PRIORITIES_AND_TARGETS_V1 } from "../lib/templates/priorities-and-targets-v1.ts";
writeFileSync(new URL("../lib/templates/health-check-v1.json", import.meta.url), JSON.stringify(HEALTH_CHECK_TEMPLATE, null, 2));
writeFileSync(new URL("../lib/templates/priorities-and-targets-v1.json", import.meta.url), JSON.stringify(PRIORITIES_AND_TARGETS_V1, null, 2));
console.log("exported");
