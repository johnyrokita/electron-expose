import { calculate } from "../src/main/routes/random-api"

const cases = [
  { args: [2, 3, "add"] as const, expected: 5 },
  { args: [9, 4, "subtract"] as const, expected: 5 },
  { args: [6, 7, "multiply"] as const, expected: 42 },
  { args: [8, 2, "divide"] as const, expected: 4 },
]

for (const testCase of cases) {
  const actual = calculate(...testCase.args)
  if (actual !== testCase.expected) {
    throw new Error(`Expected ${testCase.expected}, got ${actual}`)
  }
}

console.log("Calculator route smoke test passed")
