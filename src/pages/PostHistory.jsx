import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reconcileScheduledPosts } from '../lib/portalApi'
import { ArrowLeft, RefreshCw, Share2, Camera, Search,
  MapPin, Video, ImageIcon, FileText, ChevronDown, ChevronUp
} from 'lucide-react'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchClientProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

async function fetchPosts(clientId) {
  if (!clientId) return []

  await reconcileScheduledPosts(clientId)

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('client_id', clientId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     style: 'rgba(255,122,184,0.12)', textColor: '#ff7ab8', borderColor: 'rgba(255,122,184,0.22)' },
  scheduled: { label: 'Scheduled', style: 'rgba(56,189,248,0.12)',  textColor: '#70e4ff', borderColor: 'rgba(56,189,248,0.26)'  },
  published: { label: 'Published', style: 'rgba(133,247,169,0.10)', textColor: '#85f7a9', borderColor: 'rgba(133,247,169,0.22)' },
  failed:    { label: 'Failed',    style: 'rgba(255,122,184,0.12)', textColor: '#ff7ab8', borderColor: 'rgba(255,122,184,0.26)' },
}

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',  icon: Share2 },
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'google',    label: 'Google',    icon: MapPin  },
  { id: 'tiktok',    label: 'TikTok',    icon: Video   },
]

// ── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post }) {
  const [expanded, setExpanded] = useState(false)

  const statusInfo = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft

  const truncateLength = 120
  const isLong = post.content?.length > truncateLength
  const displayContent = expanded ? post.content : post.content?.slice(0, truncateLength) + (isLong ? '...' : '')

  const dateToDisplay = post.scheduled_for || post.published_at || post.created_at
  const dateLabel = post.status === 'scheduled' ? 'Scheduled for ' : (post.status === 'published' ? 'Published ' : 'Created ')

  return (
    <div className="rounded-2xl p-5 md:p-6 transition-all"
      style={{ background: 'rgba(9,14,24,0.78)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(112,228,255,0.28)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--portal-border)'}>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {post.platforms?.map(platformId => {
            const platform = PLATFORMS.find(p => p.id === platformId)
            const Icon = platform?.icon || FileText
            return (
              <span key={platformId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(112,228,255,0.10)', border: '1px solid rgba(112,228,255,0.24)', color: 'var(--map-brand-cyan)' }}>
                <Icon className="w-3.5 h-3.5" />
                {platform?.label || platformId}
              </span>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--portal-text-soft)' }}>
            {dateLabel} {new Date(dateToDisplay).toLocaleString()}
          </span>
          <span className="inline-flex items-center text-[10px] whitespace-nowrap font-medium uppercase tracking-widest px-2.5 py-1 rounded-full border"
            style={{ background: statusInfo.style, color: statusInfo.textColor, borderColor: statusInfo.borderColor }}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        {post.media_url && (
          <div className="shrink-0 w-24 h-24 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.075)', border: '1px solid var(--portal-border)' }}>
            {post.media_url.match(/\.(mp4|mov|webm)$/i) ? (
              <Video className="w-6 h-6" style={{ color: 'var(--portal-text-muted)' }} />
            ) : (
              <img src={post.media_url} alt="Post media" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--portal-text)' }}>
            {displayContent}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs font-medium transition-colors flex items-center gap-1 hover:text-brand-gold"
              style={{ color: 'var(--portal-primary)' }}>
              {expanded ? (
                <>Show less <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Show more <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PostHistory() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchClientProfile,
  })

  const clientId = profile?.client_id

  const { data: posts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['posts', clientId],
    queryFn: () => fetchPosts(clientId),
    enabled: !!clientId,
  })

  const filteredPosts = posts?.filter(post => {
    if (statusFilter !== 'all' && post.status !== statusFilter) return false
    if (platformFilter !== 'all' && !post.platforms?.includes(platformFilter)) return false
    return true
  })

  const filterTabBase = { padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all .15s', whiteSpace: 'nowrap' }
  const filterTabActive = { ...filterTabBase, background: 'rgba(56,189,248,0.14)', color: 'var(--map-brand-cyan)' }
  const filterTabInactive = { ...filterTabBase, background: 'transparent', color: 'var(--portal-text-muted)' }

  return (
    <div className="portal-page w-full max-w-none space-y-6 md:p-5 xl:p-6">
      {/* Back link */}
      <div className="mb-6">
        <Link
          to="/post"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-brand-gold"
          style={{ color: 'var(--portal-text-muted)' }}>
          <ArrowLeft className="w-4 h-4" />
          Back to Publisher
        </Link>
      </div>

      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>Post History</h1>
          </div>
          <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.075)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(112,228,255,0.28)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--portal-border)'}>
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 p-1.5 rounded-xl overflow-x-auto flex gap-1"
          style={{ background: 'rgba(9,14,24,0.78)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}>
          <button onClick={() => setStatusFilter('all')}
            style={statusFilter === 'all' ? filterTabActive : filterTabInactive}>All Status</button>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              style={statusFilter === key ? filterTabActive : filterTabInactive}>
              {config.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-1.5 rounded-xl overflow-x-auto flex gap-1"
          style={{ background: 'rgba(9,14,24,0.78)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}>
          <button onClick={() => setPlatformFilter('all')}
            style={platformFilter === 'all' ? filterTabActive : filterTabInactive}>All Platforms</button>
          {PLATFORMS.map(platform => (
            <button key={platform.id} onClick={() => setPlatformFilter(platform.id)}
              style={platformFilter === platform.id ? filterTabActive : filterTabInactive}
              className="flex items-center gap-1.5">
              <platform.icon className="w-3.5 h-3.5" />
              {platform.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl p-6 h-40 animate-pulse"
              style={{ background: 'rgba(9,14,24,0.72)', border: '1px solid var(--portal-border)' }} />
          ))}
        </div>
      ) : filteredPosts?.length > 0 ? (
        <div className="space-y-4">
          {filteredPosts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl p-12 flex flex-col items-center text-center"
          style={{ background: 'rgba(9,14,24,0.78)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(112,228,255,0.12)' }}>
            <Search className="w-8 h-8" style={{ color: 'var(--portal-primary)' }} />
          </div>
          <h3 className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--portal-text)' }}>No posts found</h3>
          <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--portal-text-muted)' }}>
            We couldn't find any posts matching your filters. Try adjusting them or create a new post.
          </p>
          <Link
            to="/post"
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-px"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-cyan))', color: 'var(--portal-dark)' }}>
            Create New Post
          </Link>
        </div>
      )}
    </div>
  )
}
