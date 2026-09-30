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
import { taskPriorityMeta, toDateInput } from '@/features/tasks/lib/task-meta'
import { fromDateInput } from '@/lib/format'
import { taskApi } from '@/services/task.service'
import type { User } from '@/types/auth'
import type { Project } from '@/types/project'
import { TASK_PRIORITIES, type Task, type TaskList, type TaskPayload } from '@/types/task'

/** Sentinels, since a Radix SelectItem cannot hold an empty value. */
const NO_PROJECT = '__no_project__'
const UNASSIGNED = '__unassigned__'

const formSchema = z.object({
  title: z.string().trim().min(2, 'Title is too short').max(200),
  description: z.string().trim().max(5000),
  list: z.string().min(1, 'Pick a list'),
  project: z.string(),
  assignee: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.string(),
  tags: z.string(),
})

type FormValues = z.infer<typeof formSchema>

interface Defaults {
  task?: Task
  initialTitle?: string
  defaultProjectId?: string
  defaultAssigneeId?: string
  defaultListId?: string
  /** `yyyy-MM-dd`, so a card added from a calendar cell lands on that day. */
  defaultDueDate?: string
}

function defaultsFor({
  task,
  initialTitle,
  defaultProjectId,
  defaultAssigneeId,
  defaultListId,
  defaultDueDate,
}: Defaults): FormValues {
  return {
    title: task?.title ?? initialTitle ?? '',
    description: task?.description ?? '',
    list: task?.listId ?? defaultListId ?? '',
    project: task?.project?.id ?? defaultProjectId ?? NO_PROJECT,
    assignee: task?.assignee?.id ?? defaultAssigneeId ?? UNASSIGNED,
    priority: task?.priority ?? 'MEDIUM',
    dueDate: task ? toDateInput(task.dueDate) : (defaultDueDate ?? ''),
    tags: task?.tags.join(', ') ?? '',
  }
}

interface TaskFormDialogProps extends Defaults {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: TaskList[]
  projects: Project[]
  users: User[]
  onSaved: (task: Task) => void
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  initialTitle,
  defaultProjectId,
  defaultAssigneeId,
  defaultListId,
  defaultDueDate,
  lists,
  projects,
  users,
  onSaved,
}: TaskFormDialogProps) {
  const isEdit = !!task

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor({
      task,
      initialTitle,
      defaultProjectId,
      defaultAssigneeId,
      defaultListId,
      defaultDueDate,
    }),
  })

  // Reopening for a different task must not show the previous one's values.
  useEffect(() => {
    if (open) {
      form.reset(
        defaultsFor({
          task,
          initialTitle,
          defaultProjectId,
          defaultAssigneeId,
          defaultListId,
          defaultDueDate,
        })
      )
    }
  }, [
    open,
    task,
    initialTitle,
    defaultProjectId,
    defaultAssigneeId,
    defaultListId,
    defaultDueDate,
    form,
  ])

  const onSubmit = async (values: FormValues) => {
    const payload: TaskPayload = {
      title: values.title,
      description: values.description,
      list: values.list,
      project: values.project === NO_PROJECT ? null : values.project,
      assignee: values.assignee === UNASSIGNED ? null : values.assignee,
      priority: values.priority,
      dueDate: fromDateInput(values.dueDate),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }

    try {
      const { data } = isEdit
        ? await taskApi.update(task.id, payload)
        : await taskApi.create(payload)

      toast.success(isEdit ? 'Task updated' : 'Task created')
      onSaved(data.task)
      onOpenChange(false)
    } catch (error) {
      const fallback = isEdit ? 'Unable to update task' : 'Unable to create task'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this task, who owns it and when it is due.'
              : 'Capture a task. Everything except the title is optional.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Wire up the results screen" {...field} />
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
                    <Textarea rows={3} placeholder="Any detail worth keeping." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT}>No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      A project task gets a reference like {projects[0]?.key ?? 'PROJ'}-12
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
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
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="list"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>List</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a list" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lists.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
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
                        {TASK_PRIORITIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {taskPriorityMeta[value].label}
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
                    <Input placeholder="bug, frontend" {...field} />
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
                {isEdit ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
