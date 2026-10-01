import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { ArrowLeft, Eye, Loader2, PenLine, Save, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, softSurface } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownView } from '@/features/knowledge/components/MarkdownView'
import { categoryIcons, statusMeta, visibilityMeta } from '@/features/knowledge/lib/knowledge-meta'
import { cn } from '@/lib/utils'
import { knowledgeApi } from '@/services/knowledge.service'
import { projectApi } from '@/services/project.service'
import {
  ARTICLE_VISIBILITIES,
  type Article,
  type ArticleCategory,
  type ArticleVisibility,
} from '@/types/knowledge'
import type { Project } from '@/types/project'

/** Sentinel for "no project", since a Radix SelectItem cannot hold an empty value. */
const NONE = '__none__'

const PLACEHOLDER = `## What this covers

A paragraph that tells the reader whether they are in the right place.
Link to another article with [[Its Title]] — it shows up on the graph.

## Steps

1. The first thing to do
2. The next one

> Anything worth calling out goes in a quote.
`

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(180),
    category: z.string().min(1, 'Pick a shelf for this article'),
    excerpt: z.string().trim().max(400),
    body: z.string(),
    tags: z.string(),
    visibility: z.enum(ARTICLE_VISIBILITIES),
    project: z.string(),
    changeNote: z.string().trim().max(300),
  })
  .refine((values) => values.visibility !== 'PROJECT' || values.project !== NONE, {
    message: 'Pick the project this belongs to',
    path: ['project'],
  })

type FormValues = z.infer<typeof formSchema>

function defaultsFor(article: Article | undefined, fallbackCategory: string): FormValues {
  return {
    title: article?.title ?? '',
    category: article?.category?.id ?? fallbackCategory,
    excerpt: article?.excerpt ?? '',
    body: article?.body ?? '',
    tags: (article?.tags ?? []).join(', '),
    visibility: article?.visibility ?? 'TEAM',
    project: article?.project?.id ?? NONE,
    changeNote: '',
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
}

/**
 * Writes a new article or edits an existing one. The composer is a full page
 * rather than a dialog: people write at length here, and a modal that can be
 * dismissed by a stray Escape is the wrong container for that.
 */
export default function ArticleEditorPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const isEditing = !!slug

  const [article, setArticle] = useState<Article | undefined>(undefined)
  const [categories, setCategories] = useState<ArticleCategory[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(isEditing)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(undefined, ''),
  })

  useEffect(() => {
    knowledgeApi
      .categories()
      .then(({ data }) => {
        setCategories(data.categories)
        // A new article lands on the first shelf, so the common case is one
        // less decision; it is still a plain select the author can change.
        if (!isEditing && data.categories[0]) {
          form.setValue('category', data.categories[0].id)
        }
      })
      .catch(() => setCategories([]))

    projectApi
      .list({ limit: 100 })
      .then(({ data }) => setProjects(data.projects))
      .catch(() => setProjects([]))
  }, [isEditing, form])

  useEffect(() => {
    if (!slug) return

    setIsLoading(true)
    knowledgeApi
      .get(slug)
      .then(({ data }) => {
        if (!data.article.canManage) {
          toast.error('You do not have permission to edit this article')
          navigate(`/knowledge-base/${data.article.slug}`, { replace: true })
          return
        }
        setArticle(data.article)
        form.reset(defaultsFor(data.article, ''))
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error, 'Unable to open that article'))
        navigate('/knowledge-base', { replace: true })
      })
      .finally(() => setIsLoading(false))
  }, [slug, form, navigate])

  const payloadFrom = useCallback((values: FormValues) => {
    return {
      title: values.title,
      body: values.body,
      excerpt: values.excerpt,
      category: values.category,
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      visibility: values.visibility as ArticleVisibility,
      project: values.project === NONE ? null : values.project,
      changeNote: values.changeNote || undefined,
    }
  }, [])

  /**
   * One submit path for both buttons. `publish` decides what the article's
   * status becomes: a draft stays a draft when it is merely saved, and an
   * article already on the shelf keeps the status it has.
   */
  const save = async (values: FormValues, publish: boolean) => {
    const payload = payloadFrom(values)

    try {
      if (isEditing && article) {
        const { data, message } = await knowledgeApi.update(article.slug, payload)
        if (publish && data.article.status !== 'PUBLISHED') {
          await knowledgeApi.setStatus(data.article.slug, 'PUBLISHED')
          toast.success('Article published')
        } else {
          toast.success(message)
        }
        navigate(`/knowledge-base/${data.article.slug}`)
        return
      }

      const { data, message } = await knowledgeApi.create({
        ...payload,
        status: publish ? 'PUBLISHED' : 'DRAFT',
      })
      toast.success(message)
      navigate(`/knowledge-base/${data.article.slug}`)
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the article'))
    }
  }

  const visibility = form.watch('visibility')
  const body = form.watch('body')
  const isSaving = form.formState.isSubmitting

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (!categories.length) {
    return (
      <Card variant="elevated">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <PenLine className="text-muted-foreground size-8" aria-hidden />
          <p className="font-medium">There is nowhere to file this yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            An article has to sit on a shelf. Ask an admin or manager to add the first category.
          </p>
          <Button asChild variant="outline">
            <Link to="/knowledge-base">
              <ArrowLeft />
              Back to the knowledge base
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-6">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 self-start"
        >
          <Link to={article ? `/knowledge-base/${article.slug}` : '/knowledge-base'}>
            <ArrowLeft />
            {article ? 'Back to the article' : 'Knowledge base'}
          </Link>
        </Button>

        <PageHeader
          title={isEditing ? 'Edit article' : 'Write an article'}
          description={
            article
              ? `Version ${article.version} · ${statusMeta[article.status].label.toLowerCase()}`
              : 'Markdown is supported, and [[double brackets]] link one article to another'
          }
          action={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={form.handleSubmit((values) => save(values, false))}
              >
                {isSaving && <Loader2 className="animate-spin" />}
                <Save />
                {isEditing ? 'Save changes' : 'Save draft'}
              </Button>
              {(!article || article.status !== 'PUBLISHED') && (
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={form.handleSubmit((values) => save(values, true))}
                >
                  <Send />
                  Publish
                </Button>
              )}
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="What is this article called?"
                      className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-3xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <Tabs defaultValue="write">
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel className="sr-only">Body</FormLabel>
                      <TabsList>
                        <TabsTrigger value="write">
                          <PenLine className="size-4" />
                          Write
                        </TabsTrigger>
                        <TabsTrigger value="preview">
                          <Eye className="size-4" />
                          Preview
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="write">
                      <FormControl>
                        <Textarea
                          placeholder={PLACEHOLDER}
                          className="scrollbar-slim min-h-[28rem] resize-y font-mono text-sm leading-6"
                          {...field}
                        />
                      </FormControl>
                    </TabsContent>

                    <TabsContent value="preview">
                      <div className={cn(softSurface, 'min-h-[28rem] p-5')}>
                        {body.trim() ? (
                          <MarkdownView markdown={body} />
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Nothing to preview yet.
                          </p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <aside className="flex flex-col gap-4">
            <div className={cn(softSurface, 'flex flex-col gap-4 p-4')}>
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shelf</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a shelf" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => {
                          const Icon = categoryIcons[category.icon]
                          return (
                            <SelectItem key={category.id} value={category.id}>
                              <Icon className="size-4" />
                              {category.name}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input placeholder="onboarding, deploys, postgres" {...field} />
                    </FormControl>
                    <FormDescription>
                      Comma separated. Tags are how people find this from another shelf.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="excerpt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Summary</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="One or two lines for the card"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Left blank, the opening of the article is used.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className={cn(softSurface, 'flex flex-col gap-4 p-4')}>
              <FormField
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who can read it</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ARTICLE_VISIBILITIES.map((value) => (
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

              {visibility === 'PROJECT' && (
                <FormField
                  control={form.control}
                  name="project"
                  render={({ field }) => (
                    <FormItem className="animate-tab-enter">
                      <FormLabel>Project</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>No project</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isEditing && (
                <FormField
                  control={form.control}
                  name="changeNote"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What changed</FormLabel>
                      <FormControl>
                        <Input placeholder="Fixed the deploy steps" {...field} />
                      </FormControl>
                      <FormDescription>
                        Saved against this version in the history.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </aside>
        </div>
      </form>
    </Form>
  )
}
