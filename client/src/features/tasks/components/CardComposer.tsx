import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CardComposerProps {
  onAdd: (title: string) => Promise<void>
  /** Wording for the closed trigger, e.g. "Add a card" or "Add another card". */
  label?: string
  className?: string
}

/**
 * Trello's inline composer: the trigger turns into a textarea, Enter saves and
 * keeps it open for the next card, Escape closes it.
 */
export function CardComposer({ onAdd, label = 'Add a card', className }: CardComposerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const submit = async () => {
    const trimmed = title.trim()
    if (trimmed.length < 2 || isSaving) return

    setIsSaving(true)
    try {
      await onAdd(trimmed)
      setTitle('')
      inputRef.current?.focus()
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        className={cn('text-muted-foreground h-9 w-full justify-start px-2', className)}
        onClick={() => setIsOpen(true)}
      >
        <Plus />
        {label}
      </Button>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Textarea
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
          if (event.key === 'Escape') {
            setTitle('')
            setIsOpen(false)
          }
        }}
        onBlur={() => {
          if (!title.trim()) setIsOpen(false)
        }}
        rows={2}
        maxLength={200}
        placeholder="Enter a title for this card..."
        className="resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={title.trim().length < 2 || isSaving} onClick={() => void submit()}>
          Add card
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => {
            setTitle('')
            setIsOpen(false)
          }}
          aria-label="Cancel"
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
