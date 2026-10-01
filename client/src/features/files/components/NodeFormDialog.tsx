import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
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
import { visibilityMeta } from '@/features/files/lib/file-meta'
import { fileApi } from '@/services/file.service'
import type { Project } from '@/types/project'
import { FILE_VISIBILITIES, type FileNode, type FileVisibility } from '@/types/file'

/** Sentinel for "no project", since a Radix SelectItem cannot hold an empty value. */
const NONE = '__none__'

const formSchema = z
  .object({
    name: z.string().trim().min(1, 'A name is required').max(255),
    description: z.string().trim().max(1000),
    tags: z.string(),
    visibility: z.enum(FILE_VISIBILITIES),
    project: z.string(),
  })
  .refine((values) => values.visibility !== 'PROJECT' || values.project !== NONE, {
    message: 'Pick the project this belongs to',
    path: ['project'],
  })

type FormValues = z.infer<typeof formSchema>

interface NodeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omitted when creating a folder; supplied when editing an existing node. */
  node?: FileNode
  /** Where a new folder is created. Ignored when editing. */
  parentId?: string | null
  projects: Project[]
  onSaved: () => void
}

function defaultsFor(node: FileNode | undefined): FormValues {
  return {
    name: node?.name ?? '',
    description: node?.description ?? '',
    tags: (node?.tags ?? []).join(', '),
    visibility: node?.visibility ?? 'TEAM',
    project: node?.project?.id ?? NONE,
  }
}

/** Creates a folder, or edits the name, notes, tags and visibility of any node. */
export function NodeFormDialog({
  open,
  onOpenChange,
  node,
  parentId = null,
  projects,
  onSaved,
}: NodeFormDialogProps) {
  const isEditing = !!node

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(node),
  })

  // The dialog is mounted once and reused, so each opening reseeds the fields.
  useEffect(() => {
    if (open) form.reset(defaultsFor(node))
  }, [open, node, form])

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      description: values.description,
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      visibility: values.visibility as FileVisibility,
      project: values.project === NONE ? null : values.project,
    }

    try {
      const { message } = isEditing
        ? await fileApi.update(node.id, payload)
        : await fileApi.createFolder({ ...payload, parent: parentId })

      toast.success(message)
      onOpenChange(false)
      onSaved()
    } catch (error: unknown) {
      const fallback = isEditing ? 'Unable to save changes' : 'Unable to create the folder'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit ${node.kind === 'FOLDER' ? 'folder' : 'file'}` : 'New folder'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Rename it, describe it, and choose who can see it.'
              : 'Folders pass their visibility down to whatever is created inside them.'}
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
                    <Input placeholder="Brand assets" autoFocus {...field} />
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What belongs in here, and what it is for"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visible to</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FILE_VISIBILITIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {visibilityMeta[value].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{visibilityMeta[field.value].description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.key} · {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Files it under a project. Pick project visibility above to also
                      limit it to that team.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input placeholder="logo, press-kit, 2026" {...field} />
                  </FormControl>
                  <FormDescription>Comma separated. Tags are searchable.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                {isEditing ? 'Save changes' : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
