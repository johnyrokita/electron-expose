type Operation = "add" | "subtract" | "multiply" | "divide"

const expression = document.querySelector<HTMLSpanElement>("#expression")
const result = document.querySelector<HTMLElement>("#result")
const keys = document.querySelector<HTMLElement>("#keys")

let left: number | undefined
let operation: Operation | undefined
let entry = "0"
let waitingForRight = false

const symbols: Record<Operation, string> = {
  add: "+",
  subtract: "-",
  multiply: "×",
  divide: "÷",
}

function paint(message?: string) {
  if (!expression || !result) return

  expression.textContent =
    left === undefined || operation === undefined
      ? "0"
      : `${format(left)} ${symbols[operation]} ${waitingForRight ? "" : entry}`
  result.textContent = message ?? entry
}

function format(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(8)))
}

function inputDigit(digit: string) {
  if (waitingForRight) {
    entry = digit
    waitingForRight = false
  } else {
    entry = entry === "0" ? digit : `${entry}${digit}`
  }

  paint()
}

function inputDecimal() {
  if (waitingForRight) {
    entry = "0."
    waitingForRight = false
  } else if (!entry.includes(".")) {
    entry = `${entry}.`
  }

  paint()
}

async function chooseOperation(nextOperation: Operation) {
  if (left !== undefined && operation !== undefined && !waitingForRight) {
    await equals()
  }

  left = Number(entry)
  operation = nextOperation
  waitingForRight = true
  paint()
}

async function equals() {
  if (left === undefined || operation === undefined) return

  try {
    const calculated = await window.api.math.calculate(
      left,
      Number(entry),
      operation,
    )
    entry = format(calculated)
    left = undefined
    operation = undefined
    waitingForRight = true
    paint()
  } catch (error) {
    entry = "0"
    left = undefined
    operation = undefined
    waitingForRight = true
    paint(error instanceof Error ? error.message : "Calculation failed")
  }
}

function clear() {
  left = undefined
  operation = undefined
  entry = "0"
  waitingForRight = false
  paint()
}

function backspace() {
  if (waitingForRight) return
  entry = entry.length <= 1 ? "0" : entry.slice(0, -1)
  paint()
}

keys?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  )
  if (!button) return

  const digit = button.dataset.digit
  const nextOperation = button.dataset.operation as Operation | undefined
  const action = button.dataset.action

  if (digit) inputDigit(digit)
  if (nextOperation) void chooseOperation(nextOperation)
  if (action === "decimal") inputDecimal()
  if (action === "equals") void equals()
  if (action === "clear") clear()
  if (action === "backspace") backspace()
})

paint()
