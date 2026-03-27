import { X, Maximize2, Pencil, Check, ChevronDown, ChevronUp, RotateCw, Square, Cpu, Clock, Wrench, Zap } from 'lucide-react'
import { PtyTerminalView } from '@components/PtyTerminalView'
import { TerminalView } from '@components/TerminalView'
import { Composer } from '@components/Composer'
import type { Agent, AgentStatus, AgentProfileData } from '@shared/types'
import type { CyberPalette, CyberStyle } from './types'

interface CockpitOverlayProps {
  agent: Agent
  palette: CyberPalette
  statusTheme: Record<AgentStatus, CyberStyle>
  usePtyMode: boolean
  agentMemory: Record<string, number>
  cockpitProfile: AgentProfileData | null
  // Rename
  isRenaming: boolean
  renameValue: string
  setRenameValue: (v: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  startRename: (name: string) => void
  commitRename: (agentId: string) => void
  // Terminal
  terminalCollapsed: boolean
  setTerminalCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
  // Actions
  onOpenFullView: () => void
  onClose: () => void
}

export function CockpitOverlay({
  agent,
  palette,
  statusTheme,
  usePtyMode,
  agentMemory,
  cockpitProfile,
  isRenaming,
  renameValue,
  setRenameValue,
  renameInputRef,
  startRename,
  commitRename,
  terminalCollapsed,
  setTerminalCollapsed,
  onOpenFullView,
  onClose
}: CockpitOverlayProps) {
  return (
    <div
      className="absolute right-4 top-4 bottom-4 w-96 max-w-[50%] border rounded-lg shadow-2xl flex flex-col overflow-hidden backdrop-blur-md animate-in slide-in-from-right-8 duration-200"
      style={{ backgroundColor: `${palette.cockpitBg}f2`, borderColor: palette.cockpitBorder }}
    >
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-3 shrink-0" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.cockpitHeaderBg }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusTheme[agent.status].color }} />
          {isRenaming ? (
            <form onSubmit={(e) => { e.preventDefault(); commitRename(agent.id) }} className="flex items-center gap-1">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(agent.id)}
                className="font-mono text-xs font-semibold bg-transparent border-b outline-none w-28"
                style={{ borderColor: palette.accent, color: palette.textMain }}
              />
              <button type="submit" className="p-0.5 rounded hover:opacity-80" style={{ color: palette.green }}>
                <Check size={12} />
              </button>
            </form>
          ) : (
            <>
              <span className="font-mono text-xs font-semibold" style={{ color: palette.textMain }}>{agent.name}</span>
              <button
                onClick={() => startRename(agent.name)}
                className="p-0.5 rounded hover:opacity-80 transition-opacity"
                style={{ color: palette.textMuted }}
                title="Rename"
              >
                <Pencil size={11} />
              </button>
            </>
          )}
          <span className="text-[10px] font-mono ml-1 border px-1 rounded" style={{ color: palette.textMuted, borderColor: palette.cockpitBorder }}>COCKPIT</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenFullView}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{ color: palette.textMuted }}
            title="Open Full View"
          >
            <Maximize2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-red-900/50 transition-colors"
            style={{ color: palette.textMuted }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Status Panel */}
      <div className="shrink-0 border-b px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.cockpitHeaderBg }}>
        <div className="flex items-center gap-1.5">
          <Cpu size={10} style={{ color: palette.textMuted }} />
          <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>MEM</span>
          <span className="font-mono text-[10px] font-medium" style={{ color: (agentMemory[agent.id] || 0) > 2048 ? palette.red : (agentMemory[agent.id] || 0) > 1024 ? palette.orange : palette.textMain }}>
            {(() => { const mb = agentMemory[agent.id] || 0; return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB` })()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={10} style={{ color: palette.textMuted }} />
          <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>STATUS</span>
          <span className="font-mono text-[10px] font-medium" style={{ color: statusTheme[agent.status].color }}>
            {statusTheme[agent.status].label}
          </span>
        </div>
        {agent.currentTask && (
          <div className="col-span-2 flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>TASK</span>
            <span className="font-mono text-[10px] truncate" style={{ color: palette.textMain }}>
              {agent.currentTask.slice(0, 40)}
            </span>
          </div>
        )}
      </div>

      {/* Agent Capabilities */}
      {cockpitProfile && (cockpitProfile.mcpServers.length > 0 || cockpitProfile.skills.length > 0) && (
        <div className="shrink-0 border-b px-3 py-1.5" style={{ borderColor: palette.cockpitBorder }}>
          <div className="flex items-center gap-3 flex-wrap">
            {cockpitProfile.mcpServers.length > 0 && (
              <div className="flex items-center gap-1">
                <Wrench size={9} style={{ color: palette.textMuted }} />
                <span className="font-mono text-[9px]" style={{ color: palette.textMuted }}>MCP</span>
                <span className="font-mono text-[9px] font-medium" style={{ color: palette.cyan }}>
                  {cockpitProfile.mcpServers.filter(s => s.enabled).length}
                </span>
              </div>
            )}
            {cockpitProfile.skills.length > 0 && (
              <div className="flex items-center gap-1">
                <Zap size={9} style={{ color: palette.textMuted }} />
                <span className="font-mono text-[9px]" style={{ color: palette.textMuted }}>SKILLS</span>
                <span className="font-mono text-[9px] font-medium" style={{ color: palette.green }}>
                  {cockpitProfile.skills.length}
                </span>
              </div>
            )}
          </div>
          {agent.skills.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {agent.skills.slice(0, 6).map(skill => (
                <span key={skill} className="px-1 py-px rounded text-[8px] font-mono" style={{ backgroundColor: `${palette.cyan}15`, color: palette.cyan }}>
                  {skill}
                </span>
              ))}
              {agent.skills.length > 6 && (
                <span className="text-[8px] font-mono" style={{ color: palette.textMuted }}>+{agent.skills.length - 6}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b" style={{ borderColor: palette.cockpitBorder }}>
        <button
          onClick={async () => {
            await window.api.restartAgent(agent.id)
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
          style={{ color: palette.cyan, backgroundColor: `${palette.cyan}15` }}
          title="Restart"
        >
          <RotateCw size={10} /> RESTART
        </button>
        <button
          onClick={async () => {
            await window.api.archiveAgent(agent.id)
            onClose()
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
          style={{ color: palette.red, backgroundColor: `${palette.red}15` }}
          title="Stop"
        >
          <Square size={10} /> STOP
        </button>
        <div className="ml-auto">
          <button
            onClick={() => setTerminalCollapsed(v => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
            style={{ color: palette.textMuted }}
          >
            {terminalCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
            {terminalCollapsed ? 'EXPAND' : 'COLLAPSE'}
          </button>
        </div>
      </div>

      {/* Terminal Area (collapsible) */}
      <div className={`flex-1 min-h-0 bg-black relative p-2 ${terminalCollapsed ? 'hidden' : ''}`}>
        {usePtyMode ? (
          <PtyTerminalView agentId={agent.id} compact />
        ) : (
          <>
            <TerminalView agentId={agent.id} compact />
            <div className="shrink-0 border-t p-2" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.bg }}>
              <Composer agentId={agent.id} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
