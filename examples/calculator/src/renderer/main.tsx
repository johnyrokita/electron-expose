import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import "./styles.css"

type Operation = "add" | "subtract" | "multiply" | "divide"

const operations: Array<{ value: Operation; label: string; symbol: string }> = [
  { value: "add", label: "Add", symbol: "+" },
  { value: "subtract", label: "Subtract", symbol: "-" },
  { value: "multiply", label: "Multiply", symbol: "×" },
  { value: "divide", label: "Divide", symbol: "÷" },
]

function App() {
  const [a, setA] = useState("12")
  const [b, setB] = useState("4")
  const [operation, setOperation] = useState<Operation>("add")
  const [result, setResult] = useState("16")
  const [error, setError] = useState("")

  const selected = useMemo(
    () => operations.find((item) => item.value === operation) ?? operations[0],
    [operation],
  )

  async function calculate() {
    setError("")
    const left = Number(a)
    const right = Number(b)

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      setError("Enter two valid numbers.")
      return
    }

    try {
      const next = await window.api.math.calculate(left, right, operation)
      setResult(
        Number.isInteger(next) ? String(next) : String(Number(next.toFixed(8))),
      )
    } catch (caught) {
      setResult("0")
      setError(caught instanceof Error ? caught.message : "Calculation failed.")
    }
  }

  return (
    <main className="shell">
      <section className="calculator" aria-label="Calculator">
        <div className="display">
          <span className="expression">
            {a || "0"} {selected.symbol} {b || "0"}
          </span>
          <strong className="result">{result}</strong>
        </div>

        <div className="inputs">
          <label>
            <span>First number</span>
            <input
              value={a}
              inputMode="decimal"
              onChange={(event) => setA(event.target.value)}
            />
          </label>

          <label>
            <span>Second number</span>
            <input
              value={b}
              inputMode="decimal"
              onChange={(event) => setB(event.target.value)}
            />
          </label>
        </div>

        <div className="operations" role="group" aria-label="Operation">
          {operations.map((item) => (
            <button
              key={item.value}
              className={item.value === operation ? "active" : ""}
              type="button"
              onClick={() => setOperation(item.value)}
            >
              {item.symbol}
            </button>
          ))}
        </div>

        <button
          className="calculate"
          type="button"
          onClick={() => void calculate()}
        >
          Calculate
        </button>

        <p className="status" aria-live="polite">
          {error || "Powered by generated Electron IPC."}
        </p>
      </section>
    </main>
  )
}

const root = document.querySelector("#root")
if (root) createRoot(root).render(<App />)
