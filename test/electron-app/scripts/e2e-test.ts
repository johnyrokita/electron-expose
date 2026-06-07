import { spawn } from "node:child_process"
import electron from "electron"

const child = spawn(String(electron), ["test/electron-app/dist/main.cjs"], {
  env: {
    ...process.env,
    ELECTRON_EXPOSE_E2E: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""

child.stdout.on("data", (chunk) => {
  output += String(chunk)
})

child.stderr.on("data", (chunk) => {
  output += String(chunk)
})

const code = await new Promise<number | null>((resolve) => {
  child.on("exit", resolve)
})

if (code !== 0) {
  throw new Error(`Electron e2e failed with exit code ${code}\n${output}`)
}

if (!output.includes("E2E calculator answer: 42")) {
  throw new Error(
    `Electron e2e did not call the generated preload API\n${output}`,
  )
}

console.log("Electron e2e test passed")
