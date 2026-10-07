/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function buildApps() {
  const appsDir = fileURLToPath(new URL("../../apps/", import.meta.url));
  const apps = readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const app of apps) {
    const cwd = join(appsDir, app);
    console.log(`\n=== ${app} ===`);

    for (const [command, args] of [
      ["npm", ["install"]],
      ["aio", ["app", "build"]],
    ]) {
      const result = spawnSync(command, args, { cwd, stdio: "inherit" });
      if (result.error || result.status !== 0) {
        const reason =
          result.error?.message ??
          (result.signal
            ? `terminated by ${result.signal}`
            : `exit code ${result.status}`);
        console.error(`${app}: ${command} ${args.join(" ")} failed: ${reason}`);
        return result.status || 1;
      }
    }
  }

  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = buildApps();
}
