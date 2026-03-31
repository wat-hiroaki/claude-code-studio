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
  background: '#09090b',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  selectionBackground: '#27272a',
  black: '#09090b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa'
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

  // Create terminal on agentId change only
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

    // Restore scrollback from previous session
    window.api.ptyGetScrollback(agentId).then((scrollback) => {
      if (scrollback && terminal.element) {
        terminal.write(scrollback)
      }
    }).catch(() => {
      // Ignore scrollback restore errors
    })

    // Forward keyboard input to PTY
    terminal.onData((data) => {
      window.api.ptyWrite(agentId, data)
    })

    // Ctrl+C: copy if text is selected, otherwise send interrupt to PTY
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // Ctrl+C with selection → copy to clipboard
      if (e.ctrlKey && e.key === 'c' && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection())
        terminal.clearSelection()
        return false // prevent sending to PTY
      }
      // Ctrl+Shift+C → always copy
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const sel = terminal.getSelection()
        if (sel) navigator.clipboard.writeText(sel)
        return false
      }
      // Ctrl+V → paste from clipboard with bracketed paste
      if (e.ctrlKey && e.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            const pasted = `\x1b[200~${text}\x1b[201~`
            window.api.ptyWrite(agentId, pasted)
          }
        })
        return false
      }
      // Ctrl+Shift+K → clear terminal scrollback
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        terminal.clear()
        return false
      }
      // App-level shortcuts — block from PTY and re-dispatch to window
      if (e.ctrlKey && !e.shiftKey && (e.key === 'b' || e.key === 'd' || e.key === 'n' || e.key === 'k' || e.key === 'l' || e.key === 'w')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, ctrlKey: true, shiftKey: false, bubbles: true }))
        return false
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'B')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, ctrlKey: true, shiftKey: true, bubbles: true }))
        return false
      }
      return true // let all other keys pass through to PTY
    })

    // Right-click context menu: copy selection
    const contextMenuHandler = (e: MouseEvent): void => {
      const selection = terminal.getSelection()
      if (selection) {
        e.preventDefault()
        navigator.clipboard.writeText(selection)
        // Brief visual flash to indicate copy
        const el = terminal.element
        if (el) {
          el.style.opacity = '0.7'
          setTimeout(() => { el.style.opacity = '1' }, 100)
        }
      }
    }
    terminal.element?.addEventListener('contextmenu', contextMenuHandler)

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

    // Listen for clear event
    const handleClear = (e: Event): void => {
      const detail = (e as CustomEvent).detail
      if (detail?.agentId === agentId) {
        terminal.clear()
      }
    }
    document.addEventListener('xterm:clear', handleClear)

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubData()
      unsubExit()
      resizeObserver.disconnect()
      document.removeEventListener('xterm:clear', handleClear)
      terminal.element?.removeEventListener('contextmenu', contextMenuHandler)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [agentId]) // Only recreate terminal when agent changes, theme/font handled separately

  // Update theme/fontSize without recreating terminal
  useEffect(() => {
    if (!terminalRef.current) return
    terminalRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    terminalRef.current.options.fontSize = fontSize
    fitAddonRef.current?.fit()
  }, [theme, fontSize])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ minHeight: '100px' }}
      onMouseEnter={() => terminalRef.current?.focus()}
    />
  )
}
