import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  ArrowLeft, RefreshCw, Facebook, Instagram, Search, 
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
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'    },
  scheduled: { label: 'Scheduled', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20'    },
  published: { label: 'Published', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  failed:    { label: 'Failed',    color: 'bg-red-500/15 text-red-400 border-red-500/20'       },
}

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'google', label: 'Google', icon: MapPin },
  { id: 'tiktok', label: 'TikTok', icon: Video },
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
    <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5 md:p-6 transition-all hover:border-zinc-700/60">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {post.platforms?.map(platformId => {
            const platform = PLATFORMS.find(p => p.id === platformId)
            const Icon = platform?.icon || FileText
            return (
              <span key={platformId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/50 text-xs text-zinc-300 font-medium">
                <Icon className="w-3.5 h-3.5" />
                {platform?.label || platformId}
              </span>
            )
          })}
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {dateLabel} {new Date(dateToDisplay).toLocaleString()}
          </span>
          <span className={`inline-flex items-center text-[10px] whitespace-nowrap font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        {post.media_url && (
          <div className="shrink-0 w-24 h-24 rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden flex items-center justify-center">
            {post.media_url.match(/\.(mp4|mov|webm)$/i) ? (
               <Video className="w-6 h-6 text-zinc-500" />
            ) : (
               <img src={post.media_url} alt="Post media" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {displayContent}
          </p>
          {isLong && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
            >
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

  const clientId = profile?.clients?.id

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

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Top Nav */}
      <div className="mb-6">
        <Link 
          to="/post" 
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Publisher
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Social Media</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Post History</h1>
          <p className="text-zinc-500 text-sm mt-1">
            View and manage your scheduled, published, and drafted posts.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-800 text-sm font-semibold text-zinc-300 rounded-lg transition-all border border-zinc-700/50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800/60 inline-flex overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            All Status
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === key ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {config.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800/60 inline-flex overflow-x-auto">
          <button
            onClick={() => setPlatformFilter('all')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${platformFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            All Platforms
          </button>
          {PLATFORMS.map(platform => (
            <button
              key={platform.id}
              onClick={() => setPlatformFilter(platform.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${platformFilter === platform.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
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
            <div key={i} className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-6 h-40 animate-pulse flex flex-col justify-between">
               <div className="flex justify-between">
                 <div className="w-32 h-6 bg-zinc-800 rounded-full" />
                 <div className="w-24 h-6 bg-zinc-800 rounded-full" />
               </div>
               <div className="space-y-2 mt-4">
                 <div className="w-3/4 h-4 bg-zinc-800 rounded" />
                 <div className="w-1/2 h-4 bg-zinc-800 rounded" />
               </div>
            </div>
          ))}
        </div>
      ) : filteredPosts?.length > 0 ? (
        <div className="space-y-4">
          {filteredPosts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No posts found</h3>
          <p className="text-zinc-500 text-sm max-w-sm mb-6">
            We couldn't find any posts matching your current filters. Try adjusting your filters or create a new post.
          </p>
          <Link 
            to="/post"
            className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-violet-500/20"
          >
            Create New Post
          </Link>
        </div>
      )}
    </div>
  )
}
