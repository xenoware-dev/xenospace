import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { categoryIconLabels, categoryIcons } from '@/features/knowledge/lib/knowledge-meta'
import { knowledgeApi } from '@/services/knowledge.service'
import { CATEGORY_ICONS, type ArticleCategory, type CategoryIcon } from '@/types/knowledge'

const formSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(60),
  description: z.string().trim().max(300),
  icon: z.enum(CATEGORY_ICONS),
})

type FormValues = z.infer<typeof formSchema>

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omitted when adding a shelf; supplied when editing one. */
  category?: ArticleCategory
  onSaved: () => void
}

function defaultsFor(category: ArticleCategory | undefined): FormValues {
  return {
    name: category?.name ?? '',
    description: category?.description ?? '',
    icon: category?.icon ?? 'book',
  }
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryFormDialogProps) {
  const isEditing = !!category

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(category),
  })

  // The dialog is mounted once and reused, so each opening reseeds the fields.
  useEffect(() => {
    if (open) form.reset(defaultsFor(category))
  }, [open, category, form])

  const onSubmit = async (values: FormValues) => {
    try {
      const { message } = isEditing
        ? await knowledgeApi.updateCategory(category.id, values)
        : await knowledgeApi.createCategory(values)

      toast.success(message)
      onOpenChange(false)
      onSaved()
    } catch (error) {
      const fallback = 'Unable to save the category'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    }
  }

  const onDelete = async () => {
    if (!category) return
    if (!window.confirm(`Delete the "${category.name}" shelf?`)) return

    try {
      const { message } = await knowledgeApi.removeCategory(category.id)
      toast.success(message)
      onOpenChange(false)
      onSaved()
    } catch (error) {
      const fallback = 'Unable to delete the category'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit shelf' : 'New shelf'}</DialogTitle>
          <DialogDescription>
            Shelves are how people find their way around the knowledge base — keep them broad
            and let tags do the fine sorting.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Engineering handbook" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What belongs on this shelf"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORY_ICONS.map((icon: CategoryIcon) => {
                        const Icon = categoryIcons[icon]
                        return (
                          <SelectItem key={icon} value={icon}>
                            <Icon className="size-4" />
                            {categoryIconLabels[icon]}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <FormDescription>Shown beside the shelf in the navigator.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:justify-between">
              {isEditing ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
                  <Trash2 />
                  Delete
                </Button>
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  {isEditing ? 'Save' : 'Create'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
