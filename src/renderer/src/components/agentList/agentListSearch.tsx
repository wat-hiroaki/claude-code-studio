import { useTranslation } from 'react-i18next'
import { Plus, Search, ArrowUpDown } from 'lucide-react'
import { WorkspaceSwitcher } from '@components/WorkspaceSwitcher'
import type { SortBy } from './useAgentListGroups'

interface AgentListSearchProps {
  search: string
  onSearchChange: (value: string) => void
  sortBy: SortBy
  onCycleSortBy: () => void
  onCreateNew: () => void
  appVersion: string
}

export function AgentListSearch({
  search,
  onSearchChange,
  sortBy,
  onCycleSortBy,
  onCreateNew,
  appVersion: _appVersion
}: AgentListSearchProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      {/* Workspace Switcher */}
      <div className="p-2 border-b border-border">
        <WorkspaceSwitcher />
      </div>

      {/* Header */}
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('agent.listTitle', 'Agents')}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onCycleSortBy}
              className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={`Sort: ${sortBy}`}
            >
              <ArrowUpDown size={14} />
            </button>
            <button
              onClick={onCreateNew}
              className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={t('agent.new')}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-secondary rounded border-none outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </>
  )
}
