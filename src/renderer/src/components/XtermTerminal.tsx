import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  agentId: string
  theme?: 'dark' | 'light'
  fontSize?: number
}

const DARK_THEME = {
  background: '#0d0d1a',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  selectionBackground: '#3a3a5c',
  black: '#1a1a2e',
  red: '#ff6b6b',
  green: '#51cf66',
  yellow: '#fcc419',
  blue: '#748ffc',
  magenta: '#da77f2',
  cyan: '#66d9e8',
  white: '#e0e0e0',
  brightBlack: '#555577',
  brightRed: '#ff8787',
  brightGreen: '#69db7c',
  brightYellow: '#ffe066',
  brightBlue: '#91a7ff',
  brightMagenta: '#e599f7',
  brightCyan: '#99e9f2',
  brightWhite: '#ffffff'
}

const LIGHT_THEME = {
  background: '#fafafa',
  foreground: '#1a1a2e',
  cursor: '#1a1a2e',
  selectionBackground: '#d0d0e0',
  black: '#1a1a2e',
  red: '#e03131',
  green: '#2f9e44',
  yellow: '#e67700',
  blue: '#364fc7',
  magenta: '#9c36b5',
  cyan: '#0c8599',
  white: '#e0e0e0',
  brightBlack: '#868e96',
  brightRed: '#ff6b6b',
  brightGreen: '#51cf66',
  brightYellow: '#fcc419',
  brightBlue: '#748ffc',
  brightMagenta: '#da77f2',
  brightCyan: '#66d9e8',
  brightWhite: '#ffffff'
}

export function XtermTerminal({ agentId, theme = 'dark', fontSize = 13 }: XtermTerminalProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const handleResize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        window.api.ptyResize(agentId, cols, rows)
      } catch {
        // Ignore fit errors during rapid resize
      }
    }
  }, [agentId])

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    // Forward keyboard input to PTY
    terminal.onData((data) => {
      window.api.ptyWrite(agentId, data)
    })

    // Receive PTY output
    const unsubData = window.api.onPtyData((id, data) => {
      if (id === agentId) {
        terminal.write(data)
      }
    })

    // Handle PTY exit
    const unsubExit = window.api.onPtyExit((id, exitCode) => {
      if (id === agentId) {
        terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      }
    })

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubData()
      unsubExit()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [agentId, theme, fontSize, handleResize])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ minHeight: '100px' }}
    />
  )
}
