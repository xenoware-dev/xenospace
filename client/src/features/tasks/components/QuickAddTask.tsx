import { Loader2, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface QuickAddTaskProps {
  /** Creates a TODO from just a title. Resolves once the task exists. */
  onAdd: (title: string) => Promise<void>
  /** Opens the full form, carrying whatever has been typed so far. */
  onOpenDetails: (title: string) => void
  placeholder?: string
}

export function QuickAddTask({ onAdd, onOpenDetails, placeholder }: QuickAddTaskProps) {
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async () => {
    const trimmed = title.trim()
    if (trimmed.length < 2 || isSaving) return

    setIsSaving(true)
    try {
      await onAdd(trimmed)
      setTitle('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="relative flex-1">
        <Plus className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder ?? 'Add a task and press Enter...'}
          className="pl-8"
          maxLength={200}
        />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onOpenDetails(title.trim())}
            aria-label="Add with details"
          >
            <SlidersHorizontal />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add with details</TooltipContent>
      </Tooltip>

      <Button type="submit" disabled={title.trim().length < 2 || isSaving}>
        {isSaving && <Loader2 className="animate-spin" />}
        Add
      </Button>
    </form>
  )
}
