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
import { priorityMeta, statusMeta, toDateInput } from '@/features/projects/lib/project-meta'
import { fromDateInput } from '@/lib/format'
import { projectApi } from '@/services/project.service'
import type { User } from '@/types/auth'
import type { Department } from '@/types/team'
import {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  type Project,
  type ProjectPayload,
} from '@/types/project'

/** Sentinel for "no department", since a Radix SelectItem cannot hold an empty value. */
const NONE = '__none__'

const formSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(120),
    key: z
      .string()
      .trim()
      .max(10, 'Keys are at most 10 characters')
      .regex(/^[A-Za-z0-9]*$/, 'Letters and numbers only'),
    description: z.string().trim().max(2000),
    status: z.enum(PROJECT_STATUSES),
    priority: z.enum(PROJECT_PRIORITIES),
    lead: z.string().min(1, 'Pick a project lead'),
    department: z.string(),
    startDate: z.string(),
    dueDate: z.string(),
    progress: z
      .string()
      .refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100), 'Enter 0 to 100'),
    tags: z.string(),
  })
  .refine(
    (values) =>
      !values.startDate || !values.dueDate || values.dueDate >= values.startDate,
    { message: 'The due date cannot fall before the start date', path: ['dueDate'] }
  )

type FormValues = z.infer<typeof formSchema>

function defaultsFor(project: Project | undefined, fallbackLead: string): FormValues {
  return {
    name: project?.name ?? '',
    key: project?.key ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'PLANNING',
    priority: project?.priority ?? 'MEDIUM',
    lead: project?.lead?.id ?? fallbackLead,
    department: project?.department?.id ?? NONE,
    startDate: toDateInput(project?.startDate ?? null),
    dueDate: toDateInput(project?.dueDate ?? null),
    progress: String(project?.progress ?? 0),
    tags: project?.tags.join(', ') ?? '',
  }
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present for an edit, absent when creating. */
  project?: Project
  /** Candidates for the lead select — the caller already has the directory loaded. */
  users: User[]
  departments: Department[]
  /** Who to pre-select as lead on a new project. */
  currentUserId: string
  onSaved: (project: Project) => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  users,
  departments,
  currentUserId,
  onSaved,
}: ProjectFormDialogProps) {
  const isEdit = !!project

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(project, currentUserId),
  })

  // Reopening for a different project must not show the previous one's values.
  useEffect(() => {
    if (open) form.reset(defaultsFor(project, currentUserId))
  }, [open, project, currentUserId, form])

  const onSubmit = async (values: FormValues) => {
    const payload: ProjectPayload = {
      name: values.name,
      description: values.description,
      status: values.status,
      priority: values.priority,
      lead: values.lead,
      department: values.department === NONE ? null : values.department,
      startDate: fromDateInput(values.startDate),
      dueDate: fromDateInput(values.dueDate),
      progress: values.progress === '' ? 0 : Number(values.progress),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }

    // An empty key on create lets the server derive one from the name.
    if (values.key) payload.key = values.key

    try {
      const { data } = isEdit
        ? await projectApi.update(project.id, payload)
        : await projectApi.create(payload)

      toast.success(isEdit ? 'Project updated' : 'Project created')
      onSaved(data.project)
      onOpenChange(false)
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ??
            (isEdit ? 'Unable to update project' : 'Unable to create project'))
          : isEdit
            ? 'Unable to update project'
            : 'Unable to create project'
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details of this project.'
              : 'Set up a project and assign the person leading it.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Placement App" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem className="sm:w-32">
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input placeholder="PLAC" className="font-mono uppercase" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {isEdit ? 'Task prefix' : 'Optional'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What this project delivers, and for whom."
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
                name="lead"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project lead</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a lead" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No department</SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department._id} value={department._id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusMeta[status].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priorityMeta[priority].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="progress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Progress %</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
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
                    <Input placeholder="mobile, client, q3" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">Separate tags with commas</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                {isEdit ? 'Save changes' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
