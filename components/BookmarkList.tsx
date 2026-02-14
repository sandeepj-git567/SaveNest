'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import Image from 'next/image'

type Bookmark = {
  id: string
  title: string
  url: string
  created_at: string
}

export default function BookmarkList({ userId }: { userId: string }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'domain'>('date')
  const [showConfirm, setShowConfirm] = useState<{id: string, title: string} | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const supabase = createClient()

  const fetchBookmarks = useCallback(async () => {
    setIsRefreshing(true)
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (data) setBookmarks(data)
    setIsRefreshing(false)
  }, [userId, supabase])

  useEffect(() => {
    // Fetch initial bookmarks
    fetchBookmarks()
    
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k':
            e.preventDefault()
            const searchInput = document.querySelector('input[placeholder="Search bookmarks..."]') as HTMLInputElement
            searchInput?.focus()
            break
          case 'n':
            e.preventDefault()
            setShowForm(true)
            break
          case 'd':
            e.preventDefault()
            setDarkMode(!darkMode)
            break
        }
      }
      if (e.key === 'Escape') {
        setShowForm(false)
        setShowConfirm(null)
        setEditingId(null)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    
    const channel: RealtimeChannel = supabase
      .channel('bookmarks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmarks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Realtime event:', payload)
          fetchBookmarks()
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
      })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      supabase.removeChannel(channel)
    }
  }, [userId, darkMode, fetchBookmarks, supabase])

  const fetchTitleFromUrl = async (url: string) => {
    try {
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
      const data = await response.json()
      const parser = new DOMParser()
      const doc = parser.parseFromString(data.contents, 'text/html')
      const title = doc.querySelector('title')?.textContent
      return title || getDomain(url)
    } catch {
      return getDomain(url)
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const addBookmark = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return

    // Check for duplicates
    const isDuplicate = bookmarks.some(b => b.url === url.trim())
    if (isDuplicate) {
      showToast('This URL is already bookmarked!', 'error')
      return
    }

    setLoading(true)
    
    // Auto-fetch title if empty
    let finalTitle = title.trim()
    if (!finalTitle) {
      finalTitle = await fetchTitleFromUrl(url.trim())
    }
    
    const { data, error } = await supabase.from('bookmarks').insert([
      { title: finalTitle, url: url.trim(), user_id: userId }
    ]).select()
    
    if (data && !error) {
      setBookmarks(prev => [data[0], ...prev])
      showToast('Bookmark added successfully!', 'success')
    } else {
      showToast('Failed to add bookmark', 'error')
    }
    
    setTitle('')
    setUrl('')
    setLoading(false)
    setShowForm(false)
  }

  const deleteBookmark = async (id: string) => {
    setDeletingId(id)
    const { error } = await supabase.from('bookmarks').delete().eq('id', id)
    
    if (!error) {
      setBookmarks(prev => prev.filter(bookmark => bookmark.id !== id))
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id))
      showToast('Bookmark deleted', 'success')
    } else {
      showToast('Failed to delete bookmark', 'error')
    }
    setDeletingId(null)
    setShowConfirm(null)
  }

  const editBookmark = async (id: string) => {
    if (!editTitle.trim() || !editUrl.trim()) return
    
    const { error } = await supabase
      .from('bookmarks')
      .update({ title: editTitle.trim(), url: editUrl.trim() })
      .eq('id', id)
    
    if (!error) {
      setBookmarks(prev => prev.map(b => 
        b.id === id ? { ...b, title: editTitle.trim(), url: editUrl.trim() } : b
      ))
      showToast('Bookmark updated!', 'success')
    } else {
      showToast('Failed to update bookmark', 'error')
    }
    
    setEditingId(null)
    setEditTitle('')
    setEditUrl('')
  }

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return
    
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .in('id', selectedIds)
    
    if (!error) {
      setBookmarks(prev => prev.filter(b => !selectedIds.includes(b.id)))
      showToast(`${selectedIds.length} bookmarks deleted`, 'success')
      setSelectedIds([])
    } else {
      showToast('Failed to delete bookmarks', 'error')
    }
  }

  const exportBookmarks = () => {
    const dataStr = JSON.stringify(bookmarks, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bookmarks.json'
    link.click()
    URL.revokeObjectURL(url)
    showToast('Bookmarks exported!', 'success')
  }

  const copyToClipboard = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    showToast('URL copied to clipboard!', 'success')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const filteredBookmarks = bookmarks
    .filter(b => 
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDomain(b.url).toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title)
        case 'domain':
          return getDomain(a.url).localeCompare(getDomain(b.url))
        case 'date':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    } catch {
      return null
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 relative overflow-hidden ${
      darkMode 
        ? 'bg-linear-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-linear-to-br from-indigo-100 via-purple-50 to-teal-100'
    }`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg transition-all duration-300 ${
          toast.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        </div>
      )}
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl animate-pulse ${
          darkMode 
            ? 'bg-linear-to-br from-blue-600/20 to-purple-600/20' 
            : 'bg-linear-to-br from-blue-400/20 to-purple-400/20'
        }`}></div>
        <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-pulse animation-delay-2s ${
          darkMode 
            ? 'bg-linear-to-tr from-emerald-600/20 to-blue-600/20' 
            : 'bg-linear-to-tr from-emerald-400/20 to-blue-400/20'
        }`}></div>
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-2xl animate-pulse animation-delay-4s ${
          darkMode 
            ? 'bg-linear-to-r from-pink-600/10 to-yellow-600/10' 
            : 'bg-linear-to-r from-pink-400/10 to-yellow-400/10'
        }`}></div>
      </div>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 pt-2 gap-4">
          <div className="flex items-center gap-3">
            <Image 
              src="/logo.png" 
              alt="SaveNest" 
              width={800} 
              height={240}
              className="h-16 sm:h-20 md:h-28 w-auto"
            />
            <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{bookmarks.length} saved</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`px-4 py-2 text-sm rounded-xl transition-all border border-transparent hover:shadow-sm flex items-center gap-2 ${
                darkMode 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-800 hover:border-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:border-gray-200'
              }`}
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={handleLogout}
              title="Sign out from account"
              className={`px-4 py-2 text-sm rounded-xl transition-all border border-transparent hover:shadow-sm flex items-center gap-2 ${
                darkMode 
                  ? 'text-gray-300 hover:text-white hover:bg-gray-800 hover:border-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:border-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Search & Add Button */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <svg className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm hover:shadow-md transition-all ${
                darkMode 
                  ? 'bg-gray-800 border border-gray-700 text-white placeholder:text-gray-400' 
                  : 'bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400'
              }`}
            />
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            title="Add a new bookmark"
            className="px-6 py-3 bg-linear-to-r from-blue-600 to-emerald-500 text-white rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 font-medium w-full sm:w-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className={`mb-6 rounded-2xl shadow-lg border p-4 sm:p-6 animate-slideDown ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <form onSubmit={addBookmark} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>Title</label>
                <input
                  type="text"
                  placeholder="My Awesome Website (leave empty to auto-fetch)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400' 
                      : 'border-gray-300 text-gray-900 placeholder:text-gray-400'
                  }`}
                  autoFocus
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400' 
                      : 'border-gray-300 text-gray-900 placeholder:text-gray-400'
                  }`}
                  required
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  title={loading ? 'Adding bookmark' : 'Add bookmark'}
                  className="flex-1 px-4 py-3 bg-linear-to-r from-blue-600 to-emerald-500 text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  {loading ? 'Adding...' : 'Add Bookmark'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  title="Cancel adding bookmark"
                  className={`px-6 py-3 rounded-xl transition-all font-medium ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Controls Bar */}
        <div className={`mb-6 flex flex-col sm:flex-row gap-3 p-4 rounded-xl ${
          darkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-white/50 border border-gray-200'
        }`}>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-500 text-white'
                  : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'title' | 'domain')}
            aria-label="Sort bookmarks by"
            className={`px-3 py-2 rounded-lg border transition-all ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="date">Sort by Date</option>
            <option value="title">Sort by Title</option>
            <option value="domain">Sort by Domain</option>
          </select>
          
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <span className={`px-3 py-2 text-sm ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                {selectedIds.length} selected
              </span>
              <button
                onClick={bulkDelete}
                title="Delete selected bookmarks"
                className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm"
              >
                Delete Selected
              </button>
            </div>
          )}
          
          <div className="flex gap-2 ml-auto">
            <button
              onClick={exportBookmarks}
              title="Export bookmarks to JSON"
              className={`px-3 py-2 rounded-lg transition-all text-sm ${
                darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Export
            </button>
            <button
              onClick={fetchBookmarks}
              disabled={isRefreshing}
              title={isRefreshing ? 'Refreshing bookmarks' : 'Refresh bookmarks'}
              className={`px-3 py-2 rounded-lg transition-all text-sm ${
                darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              } ${isRefreshing ? 'opacity-50' : ''}`}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`rounded-2xl p-6 max-w-md w-full ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-2 ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>Delete Bookmark</h3>
              <p className={`mb-4 ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>Are you sure you want to delete &quot;{showConfirm.title}&quot;?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => deleteBookmark(showConfirm.id)}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-all ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && filteredBookmarks.length === 0 && (
          <div className={`grid gap-4 ${viewMode === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`rounded-2xl p-5 animate-pulse ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              }`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg ${
                    darkMode ? 'bg-gray-700' : 'bg-gray-200'
                  }`}></div>
                  <div className="flex-1">
                    <div className={`h-4 rounded mb-2 ${
                      darkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}></div>
                    <div className={`h-3 rounded w-2/3 ${
                      darkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}></div>
                  </div>
                </div>
                <div className={`h-3 rounded w-1/3 mb-3 ${
                  darkMode ? 'bg-gray-700' : 'bg-gray-200'
                }`}></div>
                <div className="flex gap-2">
                  <div className={`flex-1 h-8 rounded-lg ${
                    darkMode ? 'bg-gray-700' : 'bg-gray-200'
                  }`}></div>
                  <div className={`w-16 h-8 rounded-lg ${
                    darkMode ? 'bg-gray-700' : 'bg-gray-200'
                  }`}></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Better Empty State */}
        {!loading && filteredBookmarks.length === 0 && (
          <div className={`col-span-full text-center py-16 rounded-2xl border shadow-sm ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
              darkMode ? 'bg-linear-to-br from-blue-800 to-emerald-800' : 'bg-linear-to-br from-blue-100 to-emerald-100'
            }`}>
              <svg className={`w-8 h-8 ${
                darkMode ? 'text-blue-400' : 'text-blue-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <p className={`text-lg mb-4 ${
              darkMode ? 'text-gray-300' : 'text-gray-500'
            }`}>
              {searchQuery ? 'No bookmarks found' : 'No bookmarks yet'}
            </p>
            {!searchQuery && (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setShowForm(true)}
                  title="Add your first bookmark"
                  className="px-6 py-3 bg-linear-to-r from-blue-600 to-emerald-500 text-white rounded-xl hover:shadow-lg transition-all font-medium"
                >
                  Add Your First Bookmark
                </button>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
                    input?.focus()
                  }}
                  title="Search for bookmarks"
                  className={`px-6 py-3 rounded-xl transition-all font-medium ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Try Searching
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bookmarks Display */}
        {!loading && filteredBookmarks.length > 0 && (
          <div className={`${viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-3'}`}>
          {filteredBookmarks.map((bookmark, index) => (
            <div
              key={bookmark.id}
              className={`group transition-all duration-300 animate-fadeIn ${
                viewMode === 'grid'
                  ? `rounded-2xl shadow-sm border p-5 hover:shadow-xl hover:-translate-y-1 ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`
                  : `rounded-xl border p-4 hover:shadow-md ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`
              }`}
              style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
              aria-label={`Bookmark: ${bookmark.title}`}
            >
              {editingId === bookmark.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="Title"
                  />
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="URL"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => editBookmark(bookmark.id)}
                      className="flex-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all text-xs"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null)
                        setEditTitle('')
                        setEditUrl('')
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg transition-all text-xs ${
                        darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`flex items-start gap-3 mb-3 ${
                    viewMode === 'list' ? 'flex-row' : 'flex-col sm:flex-row'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(bookmark.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => [...prev, bookmark.id])
                        } else {
                          setSelectedIds(prev => prev.filter(id => id !== bookmark.id))
                        }
                      }}
                      aria-label={`Select ${bookmark.title}`}
                      className="mt-1 rounded"
                    />
                    {getFavicon(bookmark.url) && (
                      <Image 
                        src={getFavicon(bookmark.url)!} 
                        alt={`${bookmark.title} favicon`}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-lg shadow-sm"
                        onError={(e) => e.currentTarget.style.display = 'none'}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold mb-1 truncate ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>{bookmark.title}</h3>
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-sm truncate block hover:underline ${
                          darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                        }`}
                      >
                        {getDomain(bookmark.url)}
                      </a>
                    </div>
                  </div>
                  <p className={`text-xs mb-3 ${
                    darkMode ? 'text-gray-400' : 'text-gray-400'
                  }`}>
                    {new Date(bookmark.created_at).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </p>
                  <div className={`flex gap-2 transition-opacity ${
                    viewMode === 'list' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <button
                      onClick={() => copyToClipboard(bookmark.url, bookmark.id)}
                      title="Copy URL to clipboard"
                      className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 ${
                        darkMode 
                          ? 'text-gray-300 hover:text-blue-400 hover:bg-gray-700' 
                          : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      {copiedId === bookmark.id ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(bookmark.id)
                        setEditTitle(bookmark.title)
                        setEditUrl(bookmark.url)
                      }}
                      title="Edit this bookmark"
                      className={`px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-1 ${
                        darkMode 
                          ? 'text-gray-300 hover:text-yellow-400 hover:bg-gray-700' 
                          : 'text-gray-600 hover:text-yellow-600 hover:bg-yellow-50'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => setShowConfirm({id: bookmark.id, title: bookmark.title})}
                      disabled={deletingId === bookmark.id}
                      title="Delete this bookmark"
                      className={`px-3 py-2 text-xs rounded-lg transition-all disabled:opacity-50 flex items-center gap-1 ${
                        darkMode 
                          ? 'text-gray-300 hover:text-red-400 hover:bg-gray-700' 
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
