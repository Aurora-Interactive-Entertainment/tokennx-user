import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconArrowRight, IconChevronLeft } from '@douyinfe/semi-icons'
import Skeleton from '@douyinfe/semi-ui/lib/es/skeleton'
import Spin from '@douyinfe/semi-ui/lib/es/spin'
import { PublicLayout } from '@/components/common'
import { MarkdownContent } from '@/components/markdown-content'
import { getNewsList, getNewsDetail, type NewsArticle, type NewsDetail } from '@/api/news'
import { apiTimeToDate, apiTimeToISOString, type ApiTimeValue } from '@/utils/format'
import { isApiError } from '@/api/http'
import './news-list.css'
import './news-detail.css'

function formatNewsDate(timestamp: ApiTimeValue, language: string): string {
  const date = apiTimeToDate(timestamp)
  if (!date) return ''
  const locale = language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

function newsDateTime(timestamp: ApiTimeValue): string | undefined {
  return apiTimeToISOString(timestamp) ?? undefined
}

function NewsCard({ article, language, index }: { article: NewsArticle; language: string; index: number }) {
  const { t } = useTranslation()
  const hasCover = Boolean(article.cover_image?.trim())
  return (
    <Link to={`/news/${encodeURIComponent(article.id)}`} className="news-card">
      <div className={`news-card-cover${hasCover ? '' : ' news-card-cover--fallback'}`} data-tone={index % 5}>
        {hasCover ? <img src={article.cover_image} alt="" loading="lazy" /> : <span aria-hidden="true">TOKEN NX</span>}
      </div>
      <div className="news-card-content">
        <div className="news-card-meta">
          <span className="news-card-category">{article.category}</span>
          {article.publish_date ? <time dateTime={newsDateTime(article.publish_date)}>{formatNewsDate(article.publish_date, language)}</time> : null}
        </div>
        <h2 className="news-card-title">{article.title}</h2>
        {article.description ? <p className="news-card-description">{article.description}</p> : null}
        <div className="news-card-footer">
          {article.read_time ? <span>{t('news.readTime', { minutes: article.read_time })}</span> : <span />}
          <span className="news-card-read-link">{t('common.viewDetails')} <IconArrowRight aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  )
}

function NewsListSkeleton() {
  return (
    <div className="news-list-grid news-list-skeleton" aria-busy="true" aria-label="Loading news">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="news-card-skeleton" key={index}>
          <Skeleton.Image className="news-card-skeleton-cover" />
          <div className="news-card-skeleton-content"><Skeleton.Title /><Skeleton.Paragraph rows={3} /></div>
        </div>
      ))}
    </div>
  )
}

export function NewsListPage() {
  const { t, i18n } = useTranslation()
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const locale = i18n.language.toLowerCase().startsWith('en') ? 'en-US' as const : 'zh-CN' as const

  const loadNews = useCallback(async (pageNum: number, append = false) => {
    const version = ++requestVersion.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const response = await getNewsList(pageNum, 20, locale)
      if (version !== requestVersion.current) return
      setArticles((current) => append ? [...current, ...response.items] : response.items)
      setHasMore(response.has_more)
      setPage(pageNum)
    } catch (caught) {
      if (version !== requestVersion.current) return
      setError(caught instanceof Error ? caught.message : t('api.http.requestFailed'))
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [locale, t])

  useEffect(() => {
    void loadNews(1)
  }, [loadNews])

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) void loadNews(page + 1, true)
  }, [hasMore, loadNews, loadingMore, page])

  return (
    <PublicLayout mainClassName="news-page--manuscript">
      <div className="news-list-container">
        <header className="news-list-header">
          <span className="news-list-kicker">TOKEN NX / JOURNAL</span>
          <h1 className="news-list-title">{t('news.title')}</h1>
          <p className="news-list-subtitle">{t('news.subtitle')}</p>
        </header>

        {loading && !articles.length ? <NewsListSkeleton /> : error && !articles.length ? (
          <div className="news-list-state news-list-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadNews(1)}>{t('news.retry')}</button></div>
        ) : articles.length ? (
          <>
            <div className="news-list-grid">{articles.map((article, index) => <NewsCard key={article.id} article={article} language={i18n.language} index={index} />)}</div>
            <div className="news-list-load-more">
              {hasMore ? <button type="button" className="news-load-more-button" onClick={handleLoadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? <><Spin size="small" /><span>{t('news.loading')}</span></> : <><span>{t('news.loadMore')}</span><IconArrowRight aria-hidden="true" /></>}
              </button> : <p className="news-list-end">{t('news.noMore')}</p>}
            </div>
          </>
        ) : <div className="news-list-state"><h2>{t('news.empty')}</h2><p>{t('news.emptyDescription')}</p></div>}
      </div>
    </PublicLayout>
  )
}

export function NewsDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [article, setArticle] = useState<NewsDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const locale = i18n.language.toLowerCase().startsWith('en') ? 'en-US' as const : 'zh-CN' as const

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getNewsDetail(id, locale, controller.signal).then((detail) => {
      if (!controller.signal.aborted) { setArticle(detail); setLoading(false) }
    }).catch((caught) => {
      if (controller.signal.aborted) return
      setLoading(false)
      setError({ message: caught instanceof Error ? caught.message : t('api.http.requestFailed'), requestId: isApiError(caught) ? caught.requestId : null })
    })
    return () => controller.abort()
  }, [id, locale, t])

  if (loading) return <PublicLayout mainClassName="news-page--manuscript"><div className="news-detail-container"><div className="news-detail-skeleton"><Skeleton.Title style={{ width: '72%' }} /><Skeleton.Paragraph rows={2} /><Skeleton.Paragraph rows={12} /></div></div></PublicLayout>

  if (error || !article) return <PublicLayout mainClassName="news-page--manuscript"><div className="news-detail-container"><div className="news-detail-state news-detail-error" role="alert"><h1>{t('news.notFound')}</h1><p>{error?.message || t('news.notFoundDescription')}</p><button type="button" onClick={() => navigate('/news')}>{t('news.backToList')}</button></div></div></PublicLayout>

  return (
    <PublicLayout mainClassName="news-page--manuscript">
      <div className="news-detail-container">
        <Link to="/news" className="news-detail-back"><IconChevronLeft aria-hidden="true" /><span>{t('news.backToList')}</span></Link>
        <article className="news-detail-article">
          <header className="news-detail-header">
            <div className="news-detail-meta"><span className="news-detail-category">{article.category}</span>{article.publish_date ? <time dateTime={newsDateTime(article.publish_date)}>{formatNewsDate(article.publish_date, i18n.language)}</time> : null}{article.read_time ? <span>{t('news.readTime', { minutes: article.read_time })}</span> : null}</div>
            <h1 className="news-detail-title">{article.title}</h1>
            {article.description ? <p className="news-detail-summary">{article.description}</p> : null}
            {article.author ? <div className="news-detail-author"><span aria-hidden="true">{article.author.slice(0, 1).toUpperCase()}</span><span>{article.author}</span></div> : null}
          </header>
          <div className="news-detail-content"><MarkdownContent content={article.content_markdown ?? article.content} className="news-markdown" enhancedCodeBlocks /></div>
        </article>
      </div>
    </PublicLayout>
  )
}
