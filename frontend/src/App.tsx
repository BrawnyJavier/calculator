import { Calculator } from './components/Calculator'

function App() {
  return (
    <main className="app">
      <h1 className="app-title">Calculator</h1>
      <Calculator />
      <p className="app-hint">
        Tip: use your keyboard — digits, <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd> <kbd>^</kbd>{' '}
        <kbd>%</kbd>, <kbd>R</kbd> for √, <kbd>Enter</kbd>, <kbd>Esc</kbd>
      </p>
    </main>
  )
}

export default App
