import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { AxiosError } from 'axios'
import { Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace } from '@/features/tasks/components/BoardCard'
import { BoardColumn } from '@/features/tasks/components/BoardColumn'
import { taskApi, taskListApi } from '@/services/task.service'
import type { ListTasksParams, Task, TaskList } from '@/types/task'

type CardMap = Record<string, Task[]>

interface TaskBoardProps {
  /** Filters from the page toolbar; the board reloads whenever they change. */
  params: ListTasksParams
  /** Bumped by the page after a dialog save, to pull fresh cards in. */
  refreshKey: number
  onEditCard: (task: Task) => void
  /** Lets the page refresh its summary tiles after the board changes. */
  onChanged: () => void
  /** Defaults applied to cards added straight from a column. */
  quickAddDefaults: { project?: string | null; assignee?: string | null }
}

function failed(error: unknown, fallback: string) {
  toast.error(
    error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
  )
}

function groupCards(lists: TaskList[], tasks: Task[]): CardMap {
  const grouped: CardMap = {}
  lists.forEach((list) => {
    grouped[list.id] = []
  })

  // A card whose column has gone missing falls back to the first one rather than
  // disappearing from the board with no way to get it back.
  const fallback = lists[0]?.id
  tasks.forEach((task) => {
    const target = grouped[task.listId] ? task.listId : fallback
    if (target) grouped[target].push(task)
  })

  return grouped
}

function listOfCard(cardId: string, source: CardMap) {
  return Object.keys(source).find((listId) => source[listId].some((card) => card.id === cardId))
}

/** Which column a pointer is over, whatever it happens to be hovering inside it. */
function listUnder(over: Over, source: CardMap) {
  const data = over.data.current
  if (data?.type === 'list-body') return data.listId as string
  if (data?.type === 'list') return String(over.id)
  if (data?.type === 'card') return listOfCard(String(over.id), source)
  return undefined
}

export function TaskBoard({
  params,
  refreshKey,
  onEditCard,
  onChanged,
  quickAddDefaults,
}: TaskBoardProps) {
  const [lists, setLists] = useState<TaskList[]>([])
  const [cards, setCards] = useState<CardMap>({})
  const [isLoading, setIsLoading] = useState(true)

  const [activeCard, setActiveCard] = useState<Task | null>(null)
  const [activeList, setActiveList] = useState<TaskList | null>(null)
  /** Where the dragged card started, so an unchanged drop skips the request. */
  const originRef = useRef<{ listId: string; index: number } | null>(null)

  const [isAddingList, setIsAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')

  /**
   * The drag handlers need the arrangement as it stands *right now*. Several
   * `onDragOver` updates can land before React re-renders, so reading the `cards`
   * state through a handler's closure can lag a move behind — which previously
   * had a cross-list drop computing an index of -1 and the server rejecting it.
   * Every write goes through here so the ref and the state stay in step.
   */
  const cardsRef = useRef<CardMap>({})
  const writeCards = useCallback((next: CardMap | ((previous: CardMap) => CardMap)) => {
    const resolved = typeof next === 'function' ? next(cardsRef.current) : next
    cardsRef.current = resolved
    setCards(resolved)
  }, [])

  const sensors = useSensors(
    // A small threshold keeps clicks and menu presses from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  /**
   * Columns and cards are both droppables, and a card's rect is almost always the
   * closer one — so a column drag would otherwise resolve to a card and go
   * nowhere. Each kind of drag only ever collides with its own kind of target.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const isListDrag = args.active.data.current?.type === 'list'
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) =>
        isListDrag
          ? container.data.current?.type === 'list'
          : container.data.current?.type !== 'list'
      ),
    })
  }, [])

  const load = useCallback(() => {
    setIsLoading(true)
    Promise.all([
      taskListApi.list(),
      taskApi.list({ ...params, sort: 'board', limit: 200, includeDone: true }),
    ])
      .then(([listResponse, taskResponse]) => {
        const nextLists = listResponse.data.lists
        setLists(nextLists)
        writeCards(groupCards(nextLists, taskResponse.data.tasks))
      })
      .catch((error: unknown) => failed(error, 'Unable to load the board'))
      .finally(() => setIsLoading(false))
  }, [params, writeCards])

  useEffect(load, [load, refreshKey])

  const listIds = useMemo(() => lists.map((list) => list.id), [lists])

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'list') {
      setActiveList(lists.find((list) => list.id === event.active.id) ?? null)
      return
    }

    const cardId = String(event.active.id)
    const source = cardsRef.current
    const listId = listOfCard(cardId, source)
    if (!listId) return

    const index = source[listId].findIndex((card) => card.id === cardId)
    originRef.current = { listId, index }
    setActiveCard(source[listId][index] ?? null)
  }

  /** Cards hop between columns mid-drag so the board previews the drop. */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.data.current?.type !== 'card') return

    const activeId = String(active.id)

    writeCards((previous) => {
      const from = listOfCard(activeId, previous)
      const to = listUnder(over, previous)
      if (!from || !to || from === to || !previous[to]) return previous

      const fromCards = [...previous[from]]
      const index = fromCards.findIndex((card) => card.id === activeId)
      if (index === -1) return previous

      const [moved] = fromCards.splice(index, 1)
      const toCards = [...previous[to]]
      const overIndex = toCards.findIndex((card) => card.id === String(over.id))

      toCards.splice(overIndex === -1 ? toCards.length : overIndex, 0, { ...moved, listId: to })
      return { ...previous, [from]: fromCards, [to]: toCards }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const wasList = !!activeList
    const origin = originRef.current

    setActiveCard(null)
    setActiveList(null)
    originRef.current = null

    if (!over) return

    if (wasList) {
      const oldIndex = lists.findIndex((list) => list.id === active.id)
      const newIndex = lists.findIndex((list) => list.id === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(lists, oldIndex, newIndex)
      setLists(reordered)
      taskListApi.reorder(reordered.map((list) => list.id)).catch((error: unknown) => {
        failed(error, 'Unable to reorder the lists')
        load()
      })
      return
    }

    const activeId = String(active.id)
    const source = cardsRef.current
    const currentList = listOfCard(activeId, source)
    if (!currentList || !origin) return

    // onDragOver has already carried the card across, so its column now is the
    // target column; hovering a card inside it only decides where it lands.
    const targetList = listUnder(over, source) ?? currentList
    const items = source[targetList] ?? []
    const oldIndex = items.findIndex((card) => card.id === activeId)
    const overIndex =
      over.data.current?.type === 'card' ? items.findIndex((card) => card.id === String(over.id)) : -1

    if (oldIndex !== -1 && overIndex !== -1 && overIndex !== oldIndex) {
      writeCards({ ...source, [targetList]: arrayMove(items, oldIndex, overIndex) })
    }

    const settled = cardsRef.current[targetList] ?? []
    const finalIndex = settled.findIndex((card) => card.id === activeId)
    if (finalIndex === -1) return
    if (origin.listId === targetList && origin.index === finalIndex) return

    taskApi
      .move(activeId, { list: targetList, index: finalIndex })
      .then(({ data }) => {
        // The server owns isDone and completedAt, so take its copy back.
        writeCards((previous) => ({
          ...previous,
          [targetList]: (previous[targetList] ?? []).map((card) =>
            card.id === data.task.id ? data.task : card
          ),
        }))
        onChanged()
      })
      .catch((error: unknown) => {
        failed(error, 'Unable to move that card')
        load()
      })
  }

  const handleAddCard = async (list: TaskList, title: string) => {
    try {
      const { data } = await taskApi.create({
        title,
        list: list.id,
        project: quickAddDefaults.project ?? null,
        assignee: quickAddDefaults.assignee ?? null,
      })
      writeCards((previous) => ({ ...previous, [list.id]: [data.task, ...(previous[list.id] ?? [])] }))
      onChanged()
    } catch (error) {
      failed(error, 'Unable to add that card')
    }
  }

  const handleDeleteCard = async (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await taskApi.remove(task.id)
      writeCards((previous) => ({
        ...previous,
        [task.listId]: (previous[task.listId] ?? []).filter((card) => card.id !== task.id),
      }))
      toast.success('Card deleted')
      onChanged()
    } catch (error) {
      failed(error, 'Unable to delete that card')
    }
  }

  const handleAddList = async () => {
    const name = newListName.trim()
    if (!name) return
    try {
      const { data } = await taskListApi.create({ name })
      setLists((previous) => [...previous, data.list])
      writeCards((previous) => ({ ...previous, [data.list.id]: [] }))
      setNewListName('')
      setIsAddingList(false)
    } catch (error) {
      failed(error, 'Unable to add that list')
    }
  }

  const handleRenameList = async (list: TaskList, name: string) => {
    setLists((previous) => previous.map((item) => (item.id === list.id ? { ...item, name } : item)))
    try {
      await taskListApi.update(list.id, { name })
    } catch (error) {
      failed(error, 'Unable to rename that list')
      load()
    }
  }

  const handleToggleListDone = async (list: TaskList, isDone: boolean) => {
    try {
      const { data } = await taskListApi.update(list.id, { isDone })
      setLists((previous) => previous.map((item) => (item.id === list.id ? data.list : item)))
      load()
      onChanged()
    } catch (error) {
      failed(error, 'Unable to update that list')
    }
  }

  const handleDeleteList = async (list: TaskList) => {
    const count = cards[list.id]?.length ?? 0
    const warning = count
      ? `Delete "${list.name}" and its ${count} ${count === 1 ? 'card' : 'cards'}? This cannot be undone.`
      : `Delete "${list.name}"?`
    if (!window.confirm(warning)) return

    try {
      await taskListApi.remove(list.id)
      setLists((previous) => previous.filter((item) => item.id !== list.id))
      writeCards((previous) => {
        const next = { ...previous }
        delete next[list.id]
        return next
      })
      toast.success('List deleted')
      onChanged()
    } catch (error) {
      failed(error, 'Unable to delete that list')
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-72 shrink-0 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveCard(null)
        setActiveList(null)
        originRef.current = null
        // A cancelled drag may have already shuffled cards in the preview.
        load()
      }}
    >
      <div className="scrollbar-slim flex items-start gap-4 overflow-x-auto pb-4">
        <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
          {lists.map((list) => (
            <BoardColumn
              key={list.id}
              list={list}
              cards={cards[list.id] ?? []}
              onAddCard={handleAddCard}
              onRename={handleRenameList}
              onToggleDone={handleToggleListDone}
              onDelete={handleDeleteList}
              onEditCard={onEditCard}
              onDeleteCard={handleDeleteCard}
            />
          ))}
        </SortableContext>

        <div className="w-72 shrink-0">
          {isAddingList ? (
            <div className="glass flex flex-col gap-2 rounded-2xl p-2">
              <Input
                autoFocus
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleAddList()
                  if (event.key === 'Escape') {
                    setNewListName('')
                    setIsAddingList(false)
                  }
                }}
                placeholder="Enter list name..."
                maxLength={60}
                className="h-8 text-sm"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!newListName.trim()} onClick={() => void handleAddList()}>
                  Add list
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => {
                    setNewListName('')
                    setIsAddingList(false)
                  }}
                  aria-label="Cancel"
                >
                  <X />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="h-11 w-full justify-start"
              onClick={() => setIsAddingList(true)}
            >
              <Plus />
              Add another list
            </Button>
          )}
        </div>
      </div>

      {/*
        The overlay is `position: fixed`, and the routed page sits inside the
        layout's `.glass` panel. `backdrop-filter` makes that panel the containing
        block for fixed descendants, which anchored the dragged card to the panel
        instead of the viewport and left it trailing the cursor by the panel's
        offset. A portal to <body> puts it back on the viewport.
      */}
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {activeCard && (
            <div className="w-68 rotate-2">
              <CardFace
                task={activeCard}
                onEdit={onEditCard}
                onDelete={handleDeleteCard}
                isDragging
              />
            </div>
          )}
          {activeList && (
            <div className="glass w-72 rounded-2xl p-2 opacity-90">
              <p className="px-1 text-sm font-semibold">{activeList.name}</p>
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  )
}
