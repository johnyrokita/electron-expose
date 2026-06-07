import { exposed } from "../../../../../src/index"

export type Operation = "add" | "subtract" | "multiply" | "divide"

export const calculate = exposed(
  "math.calculate",
  (a: number, b: number, operation: Operation): number => {
    if (operation === "add") return a + b
    if (operation === "subtract") return a - b
    if (operation === "multiply") return a * b
    if (b === 0) throw new Error("Cannot divide by zero")
    return a / b
  },
)
