import { expose } from "electron-expose"

export type Operation = "add" | "subtract" | "multiply" | "divide"

export class CalculatorRoutes {
  @expose("math.calculate")
  calculate(a: number, b: number, operation: Operation): number {
    if (operation === "add") return a + b
    if (operation === "subtract") return a - b
    if (operation === "multiply") return a * b
    if (b === 0) throw new Error("Cannot divide by zero")
    return a / b
  }
}
