import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, RotateCw, Globe, ExternalLink } from 'lucide-react'

interface ElectronWebview extends HTMLElement {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  getTitle: () => string;
  goBack: () => void;
  goForward: () => void;
  stop: () => void;
  reload: () => void;
}

export function BrowserPanel(): JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState('https://www.google.com')
  const [inputUrl, setInputUrl] = useState('https://www.google.com')
  const [title, setTitle] = useState('')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const webviewRef = useRef<HTMLElement | null>(null)

  const navigate = useCallback((targetUrl: string) => {
    let normalized = targetUrl.trim()
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      // If it looks like a URL, add https://
      if (normalized.includes('.') && !normalized.includes(' ')) {
        normalized = 'https://' + normalized
      } else {
        // Search query
        normalized = `https://www.google.com/search?q=${encodeURIComponent(normalized)}`
      }
    }
    setUrl(normalized)
    setInputUrl(normalized)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      navigate(inputUrl)
    }
  }

  useEffect(() => {
    const webview = webviewRef.current as ElectronWebview | null
    if (!webview) return

    const handleNavigation = (): void => {
      setCanGoBack(webview.canGoBack?.() ?? false)
      setCanGoForward(webview.canGoForward?.() ?? false)
      setInputUrl(webview.getURL?.() ?? '')
      setTitle(webview.getTitle?.() ?? '')
    }

    const handleStartLoading = (): void => setIsLoading(true)
    const handleStopLoading = (): void => {
      setIsLoading(false)
      handleNavigation()
    }

    webview.addEventListener('did-navigate', handleNavigation)
    webview.addEventListener('did-navigate-in-page', handleNavigation)
    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('page-title-updated', handleNavigation)

    return () => {
      webview.removeEventListener('did-navigate', handleNavigation)
      webview.removeEventListener('did-navigate-in-page', handleNavigation)
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('page-title-updated', handleNavigation)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-secondary/30">
        <button
          onClick={() => (webviewRef.current as ElectronWebview | null)?.goBack()}
          disabled={!canGoBack}
          className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
          title={t('browser.back', 'Back')}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={() => (webviewRef.current as ElectronWebview | null)?.goForward()}
          disabled={!canGoForward}
          className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
          title={t('browser.forward', 'Forward')}
        >
          <ArrowRight size={14} />
        </button>
        <button
          onClick={() => {
            const wv = webviewRef.current as ElectronWebview | null
            if (isLoading) {
              wv?.stop()
            } else {
              wv?.reload()
            }
          }}
          className="p-1 rounded hover:bg-accent transition-colors"
          title={isLoading ? t('browser.stop', 'Stop') : t('browser.reload', 'Reload')}
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <div className="flex-1 flex items-center gap-1.5 bg-background rounded px-2 py-1 border border-border">
          <Globe size={12} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
            placeholder={t('browser.placeholder', 'Enter URL or search...')}
          />
        </div>
        <button
          onClick={() => {
            const wv = webviewRef.current as ElectronWebview | null
            if (wv) {
              window.open(wv.getURL(), '_blank')
            }
          }}
          className="p-1 rounded hover:bg-accent transition-colors"
          title={t('browser.openExternal', 'Open in external browser')}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* Title bar */}
      {title && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground truncate border-b border-border bg-secondary/10">
          {title}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="h-0.5 bg-primary/30">
          <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Webview */}
      <webview
        ref={webviewRef as React.RefObject<HTMLElement>}
        src={url}
        className="flex-1"
        style={{ display: 'flex', flex: 1 }}
      />
    </div>
  )
}
