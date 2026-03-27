// Layout tree types for VS Code-style free split layout

export type DropPosition = 'top' | 'right' | 'bottom' | 'left' | 'center'

export type LayoutLeaf = {
  type: 'leaf'
  id: string
  agentId: string | null
}

export type LayoutSplit = {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
  sizes: number[]
}

export type LayoutNode = LayoutLeaf | LayoutSplit

let _counter = 0
export function generateId(): string {
  return `pane-${Date.now().toString(36)}-${(++_counter).toString(36)}`
}

export const DEFAULT_LAYOUT: LayoutNode = { type: 'leaf', id: 'root', agentId: null }

/** Find a node by id in the tree */
export function findNode(tree: LayoutNode, id: string): LayoutNode | null {
  if (tree.id === id) return tree
  if (tree.type === 'split') {
    for (const child of tree.children) {
      const found = findNode(child, id)
      if (found) return found
    }
  }
  return null
}

/** Find parent split of a node */
export function findParent(tree: LayoutNode, id: string): LayoutSplit | null {
  if (tree.type === 'split') {
    for (const child of tree.children) {
      if (child.id === id) return tree
      const found = findParent(child, id)
      if (found) return found
    }
  }
  return null
}

/** Deep clone a layout tree */
export function cloneTree(node: LayoutNode): LayoutNode {
  if (node.type === 'leaf') {
    return { ...node }
  }
  return {
    ...node,
    children: node.children.map(cloneTree),
    sizes: [...node.sizes]
  }
}

/** Replace a node in tree by id, returns new tree */
export function replaceNode(tree: LayoutNode, id: string, replacement: LayoutNode): LayoutNode {
  if (tree.id === id) return replacement
  if (tree.type === 'split') {
    return {
      ...tree,
      children: tree.children.map(child => replaceNode(child, id, replacement)),
      sizes: [...tree.sizes]
    }
  }
  return tree
}

/** Split a leaf into two panes */
export function splitLeaf(
  tree: LayoutNode,
  leafId: string,
  direction: 'horizontal' | 'vertical',
  newAgentId: string,
  position: 'before' | 'after'
): LayoutNode {
  const newTree = cloneTree(tree)
  const leaf = findNode(newTree, leafId) as LayoutLeaf | null
  if (!leaf || leaf.type !== 'leaf') return newTree

  const newLeaf: LayoutLeaf = { type: 'leaf', id: generateId(), agentId: newAgentId }
  const children = position === 'before' ? [newLeaf, { ...leaf }] : [{ ...leaf }, newLeaf]

  // Check if parent has same direction — merge into it instead of nesting
  const parent = findParent(newTree, leafId)
  if (parent && parent.direction === direction) {
    const idx = parent.children.findIndex(c => c.id === leafId)
    if (idx !== -1) {
      const oldSize = parent.sizes[idx]
      const half = oldSize / 2
      if (position === 'before') {
        parent.children.splice(idx, 0, newLeaf)
        parent.sizes.splice(idx, 0, half)
        parent.sizes[idx + 1] = half
      } else {
        parent.children.splice(idx + 1, 0, newLeaf)
        parent.sizes[idx] = half
        parent.sizes.splice(idx + 1, 0, half)
      }
      return newTree
    }
  }

  const splitNode: LayoutSplit = {
    type: 'split',
    id: generateId(),
    direction,
    children,
    sizes: [50, 50]
  }

  return replaceNode(newTree, leafId, splitNode)
}

/** Remove a leaf from the tree, collapsing parent if needed */
export function removeLeaf(tree: LayoutNode, leafId: string): LayoutNode {
  if (tree.type === 'leaf') {
    // Can't remove root leaf — just clear the agent
    if (tree.id === leafId) return { ...tree, agentId: null }
    return tree
  }

  const newTree = cloneTree(tree)
  return removeLeafInner(newTree, leafId) || DEFAULT_LAYOUT
}

function removeLeafInner(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.type !== 'split') return node

  const idx = node.children.findIndex(c => c.id === leafId)
  if (idx !== -1) {
    // Found the leaf in this split — remove it
    node.children.splice(idx, 1)
    node.sizes.splice(idx, 1)

    if (node.children.length === 0) return null
    if (node.children.length === 1) {
      // Collapse: return the remaining child
      return node.children[0]
    }
    // Redistribute sizes
    const total = node.sizes.reduce((a, b) => a + b, 0)
    node.sizes = node.sizes.map(s => (s / total) * 100)
    return node
  }

  // Recurse into children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.type === 'split') {
      const result = removeLeafInner(child, leafId)
      if (result !== child) {
        if (result === null) {
          node.children.splice(i, 1)
          node.sizes.splice(i, 1)
          if (node.children.length === 1) return node.children[0]
          const total = node.sizes.reduce((a, b) => a + b, 0)
          node.sizes = node.sizes.map(s => (s / total) * 100)
        } else {
          node.children[i] = result
        }
        return node
      }
    }
  }

  return node
}

/** Set agent on a leaf */
export function setLeafAgent(tree: LayoutNode, leafId: string, agentId: string | null): LayoutNode {
  if (tree.type === 'leaf' && tree.id === leafId) {
    return { ...tree, agentId }
  }
  if (tree.type === 'split') {
    return {
      ...tree,
      children: tree.children.map(child => setLeafAgent(child, leafId, agentId)),
      sizes: [...tree.sizes]
    }
  }
  return tree
}

/** Get all leaf agent IDs from the tree */
export function getAllAgentIds(tree: LayoutNode): string[] {
  if (tree.type === 'leaf') {
    return tree.agentId ? [tree.agentId] : []
  }
  return tree.children.flatMap(getAllAgentIds)
}

/** Get all leaf nodes from the tree */
export function getAllLeaves(tree: LayoutNode): LayoutLeaf[] {
  if (tree.type === 'leaf') return [tree]
  return tree.children.flatMap(getAllLeaves)
}

/** Determine drop position from cursor coordinates within element bounds */
export function getDropPosition(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  edgeThreshold = 0.25
): DropPosition {
  const relX = (clientX - rect.left) / rect.width
  const relY = (clientY - rect.top) / rect.height

  // Check edges first (25% from each edge)
  if (relY < edgeThreshold) return 'top'
  if (relY > 1 - edgeThreshold) return 'bottom'
  if (relX < edgeThreshold) return 'left'
  if (relX > 1 - edgeThreshold) return 'right'

  return 'center'
}

/** Convert DropPosition to split direction and position */
export function dropToSplit(drop: DropPosition): { direction: 'horizontal' | 'vertical'; position: 'before' | 'after' } | null {
  switch (drop) {
    case 'left': return { direction: 'horizontal', position: 'before' }
    case 'right': return { direction: 'horizontal', position: 'after' }
    case 'top': return { direction: 'vertical', position: 'before' }
    case 'bottom': return { direction: 'vertical', position: 'after' }
    case 'center': return null
  }
}

/** Count leaf panes in the tree */
export function countLeaves(tree: LayoutNode): number {
  if (tree.type === 'leaf') return 1
  return tree.children.reduce((sum, child) => sum + countLeaves(child), 0)
}
