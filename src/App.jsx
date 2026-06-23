import React, { useState, useRef, useEffect } from 'react'
import { FileSpreadsheet, Calendar, Users, User, Menu, X, Hammer, Plus, UserPlus, FolderPlus, Trash2, Edit } from 'lucide-react'
import './App.css'
import { supabase } from './supabase'

// Date format conversion helpers
const formatDateToDisplay = (dateStr) => {
  if (!dateStr) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr
  const cleanStr = dateStr.replace(/\//g, '-')
  const parts = cleanStr.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

const formatDateToDB = (dateStr) => {
  if (!dateStr) return null
  
  // Strip all non-digit characters to see if we have 8 raw digits (e.g. 17052026)
  const rawDigits = dateStr.replace(/\D/g, '')
  if (rawDigits.length === 8) {
    const day = rawDigits.substring(0, 2)
    const month = rawDigits.substring(2, 4)
    const year = rawDigits.substring(4, 8)
    return `${year}-${month}-${day}`
  }

  // Fallback to standard separator matching
  const cleanStr = dateStr.replace(/-/g, '/')
  const parts = cleanStr.split('/')
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    const year = parts[2]
    if (year.length === 4) {
      return `${year}-${month}-${day}`
    }
  }
  return dateStr
}


function App() {
  const [activePage, setActivePage] = useState('SHEET')
  const [isMobileExpanded, setIsMobileExpanded] = useState(false)
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [activeModal, setActiveModal] = useState(null) // 'ADD_EVENT', 'ADD_MEMBER', 'EDIT_CELL', 'EDIT_EVENT'
  const [editingEventItem, setEditingEventItem] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)
  
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [memberDomainFilter, setMemberDomainFilter] = useState('All')
  const [memberYearFilter, setMemberYearFilter] = useState('All')
  const [dashboardDomain, setDashboardDomain] = useState('Photographer')

  // Auth States
  const [session, setSession] = useState(null)
  const [currentUserProfile, setCurrentUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [onboardingStep, setOnboardingStep] = useState(0) // 0: none, 1: year select, 2: claim name
  const [selectedOnboardingYear, setSelectedOnboardingYear] = useState('1st Year')
  const [selectedClaimName, setSelectedClaimName] = useState('')
  const [newOnboardingMemberName, setNewOnboardingMemberName] = useState('')
  const [newOnboardingMemberDomain, setNewOnboardingMemberDomain] = useState('Photographer')
  const [showAddInOnboarding, setShowAddInOnboarding] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])
  
  const tableScrollRef = useRef(null)

  // 1. Core States for dynamic updates
  const [events, setEvents] = useState([])
  const [members, setMembers] = useState([])

  // Google OAuth Logins
  const handleGoogleLogin = async () => {
    try {
      setAuthLoading(true)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      alert('Google Login failed: ' + err.message)
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setAuthLoading(true)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (err) {
      alert('Sign out error: ' + err.message)
      setAuthLoading(false)
    }
  }

  const handleClaimProfile = async (memberName) => {
    try {
      setAuthLoading(true)
      if (!session) return

      const { data, error } = await supabase
        .from('members')
        .update({ user_id: session.user.id })
        .eq('name', memberName)
        .select()
        .single()
      
      if (error) throw error

      setCurrentUserProfile(data)
      setOnboardingStep(0)
      setToastMessage(`Profile claimed successfully as ${data.name}!`)
      fetchMembers()
    } catch (err) {
      alert('Error claiming profile: ' + err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCreateAndClaimProfile = async () => {
    try {
      if (!newOnboardingMemberName.trim()) {
        alert('Please enter your name.')
        return
      }
      setAuthLoading(true)
      
      const newMember = {
        name: newOnboardingMemberName.trim(),
        year: selectedOnboardingYear,
        domain: newOnboardingMemberDomain,
        completed: 0,
        user_id: session.user.id
      }

      const { data, error } = await supabase
        .from('members')
        .insert([newMember])
        .select()
        .single()

      if (error) throw error

      setCurrentUserProfile(data)
      setOnboardingStep(0)
      setToastMessage(`Profile created and claimed successfully as ${data.name}!`)
      fetchMembers()
    } catch (err) {
      alert('Error creating profile: ' + err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  // Sort events by date descending
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = a.date ? new Date(a.date) : new Date(0)
    const dateB = b.date ? new Date(b.date) : new Date(0)
    return dateB - dateA
  })

  // Filter events by search query
  const filteredEvents = sortedEvents.filter(ev => 
    ev.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    ev.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate tasks completed dynamically for a member
  const getTasksCountForMember = (memberName) => {
    let count = 0
    events.forEach(ev => {
      const domains = ['photographer', 'graphic', 'writer', 'videographer', 'editor', 'pr', 'dev']
      domains.forEach(d => {
        if (ev[d] && Array.isArray(ev[d])) {
          const isAssigned = ev[d].some(p => p.name === memberName)
          if (isAssigned) {
            count++
          }
        }
      })
    })
    return count
  }

  // Personal Dashboard calculations
  const getContributionRank = (memberName) => {
    const activeM = members.filter(m => m.year === '1st Year' || m.year === '2nd Year')
    const sorted = activeM.map(m => ({
      name: m.name,
      tasks: (m.completed || 0) + getTasksCountForMember(m.name)
    })).sort((a, b) => b.tasks - a.tasks)

    const rankIdx = sorted.findIndex(m => m.name === memberName)
    return rankIdx !== -1 ? `#${rankIdx + 1}` : 'N/A'
  }

  const getUserRecentAssignments = (memberName) => {
    const userEvents = []
    events.forEach(ev => {
      const domains = ['photographer', 'graphic', 'writer', 'videographer', 'editor', 'pr', 'dev']
      domains.forEach(d => {
        if (ev[d] && Array.isArray(ev[d])) {
          const matched = ev[d].find(p => p.name === memberName)
          if (matched) {
            userEvents.push({
              id: ev.id,
              name: ev.name,
              date: ev.date,
              role: getDomainFromKey(d),
              type: matched.type
            })
          }
        }
      })
    })
    return userEvents.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0)
      const dateB = b.date ? new Date(b.date) : new Date(0)
      return dateB - dateA
    }).slice(0, 5)
  }

  // Fetch from Supabase
  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      if (data) setEvents(data)
    } catch (err) {
      console.error('Error fetching events:', err.message)
    }
  }

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      if (data) setMembers(data)
    } catch (err) {
      console.error('Error fetching members:', err.message)
    }
  }

  const checkUserClaims = async (user) => {
    try {
      setAuthLoading(true)
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (error) throw error

      if (data) {
        setCurrentUserProfile(data)
        setOnboardingStep(0)
      } else {
        setCurrentUserProfile(null)
        setOnboardingStep(1)
      }
    } catch (err) {
      console.error('Error checking user claims:', err.message)
      alert('Error checking user claims: ' + err.message + '\n\nIMPORTANT: Please ensure you ran the SQL migration to add the "user_id" column to the "members" table in your Supabase SQL Editor:\nALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE DEFAULT NULL;')
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    fetchMembers()
  }, [])

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        checkUserClaims(session.user)
      } else {
        setAuthLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        checkUserClaims(session.user)
      } else {
        setCurrentUserProfile(null)
        setOnboardingStep(0)
        setAuthLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [members.length])

  // Cell Editor States
  const [editingCellInfo, setEditingCellInfo] = useState(null) // { eventId, domainKey }

  useEffect(() => {
    const tableScrollContainer = tableScrollRef.current
    if (!tableScrollContainer) return

    const handleWheelNative = (e) => {
      if (e.altKey) {
        e.preventDefault()
        tableScrollContainer.scrollLeft += e.deltaY
      }
    }

    tableScrollContainer.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => {
      tableScrollContainer.removeEventListener('wheel', handleWheelNative)
    }
  }, [activePage, events])

  const navItems = [
    { id: 'SHEET', label: 'SHEET', icon: FileSpreadsheet },
    { id: 'DASHBOARD', label: 'DASHBOARD', icon: Calendar },
    { id: 'MEMBER', label: 'MEMBER', icon: Users },
    { id: 'ACCOUNT', label: 'ACCOUNT', icon: User }
  ]

  // Translate Sheet Column key to Domain string for filtering/editing
  const getDomainFromKey = (key) => {
    switch (key) {
      case 'photographer': return 'Photographer'
      case 'graphic': return 'Graphic Designer'
      case 'writer': return 'Content Writter'
      case 'videographer': return 'Video Editor'
      case 'editor': return 'Video Editor'
      case 'pr': return 'Public Relation'
      case 'dev': return 'Web Developer'
      default: return ''
    }
  }

  const renderPersonnel = (people, showNull = false) => {
    if (!people || people.length === 0) {
      return showNull ? <span className="unassigned-placeholder">-</span> : null
    }
    return (
      <div className="personnel-list">
        {people.map((p, idx) => (
          <span key={idx} className={`person-badge ${p.type}`} title={p.type.toUpperCase()}>
            {p.name}
          </span>
        ))}
      </div>
    )
  }

  const openCellEditor = (eventId, domainKey) => {
    setEditingCellInfo({ eventId, domainKey })
    setActiveModal('EDIT_CELL')
  }

  const handleDeleteEvent = async (id) => {
    if (!confirm("Are you sure you want to delete this event?")) return
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)
      if (error) throw error
      setEvents(events.filter(ev => ev.id !== id))
    } catch (err) {
      alert("Error deleting event: " + err.message)
    }
  }

  const handleDeleteMember = async (id, name) => {
    if (!confirm(`Are you sure you want to delete member ${name}?`)) return
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', id)
      if (error) throw error
      setMembers(members.filter(m => m.id !== id))
    } catch (err) {
      alert("Error deleting member: " + err.message)
    }
  }

  const renderContent = () => {
    switch (activePage) {
      case 'SHEET': {
        return (
          <div className="page-layout">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              {!isFocusMode ? (
                <div>
                  <h1 className="page-title">Performance Sheets</h1>
                  <p className="page-subtitle">Track, evaluate, and export member performance records. Click cells in Desktop view to edit assignees.</p>
                </div>
              ) : (
                <div></div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search events..." 
                  style={{ maxWidth: '200px', padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button className="sheet-action-btn" onClick={() => alert("CSV Export Triggered!")}>Export CSV</button>
                <button className={`sheet-action-btn ${isFocusMode ? 'primary' : ''}`} onClick={() => setIsFocusMode(!isFocusMode)}>
                  {isFocusMode ? 'Exit Full Screen' : 'Full Screen'}
                </button>
                <button className="sheet-action-btn primary" onClick={() => window.print()}>Print Sheet</button>
              </div>
            </header>

            {/* Desktop Table View */}
            <div className="desktop-table-view">
              <div className="table-card">
                <div 
                  ref={tableScrollRef}
                  className="table-scroll-container"
                >
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>EVENT ID</th>
                        <th>EVENT NAME</th>
                        <th>DATE</th>
                        <th>PHOTOGRAPHER</th>
                        <th>GRAPHIC DESIGNER</th>
                        <th>CONTENT WRITTER</th>
                        <th>VIDEOGRAPHER</th>
                        <th>VIDEO EDITOR</th>
                        <th>PR</th>
                        <th>WEB DEVELOPER</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.length === 0 ? (
                        <tr>
                          <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: '500' }}>
                            No data to show
                          </td>
                        </tr>
                      ) : (
                        filteredEvents.map((ev) => (
                          <tr key={ev.id}>
                            <td className="highlight-cell">{ev.id}</td>
                            <td style={{ fontWeight: '600' }}>{ev.name}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateToDisplay(ev.date) || 'No Date'}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'photographer')}>{renderPersonnel(ev.photographer, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'graphic')}>{renderPersonnel(ev.graphic, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'writer')}>{renderPersonnel(ev.writer, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'videographer')}>{renderPersonnel(ev.videographer, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'editor')}>{renderPersonnel(ev.editor, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'pr')}>{renderPersonnel(ev.pr, true)}</td>
                            <td className="clickable-cell" onClick={() => openCellEditor(ev.id, 'dev')}>{renderPersonnel(ev.dev, true)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <button className="remove-assignee-btn" style={{ color: 'var(--maroon-primary)' }} onClick={() => { setEditingEventItem(ev); setActiveModal('EDIT_EVENT'); }} title="Edit Event Name & Date">
                                  <Edit size={16} />
                                </button>
                                <button className="remove-assignee-btn" onClick={() => handleDeleteEvent(ev.id)} title="Delete Event">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="mobile-cards-view">
              {filteredEvents.length === 0 ? (
                <div className="coming-soon-card" style={{ minHeight: '150px', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, fontWeight: '500' }}>No data to show</p>
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const pContent = renderPersonnel(ev.photographer)
                  const gContent = renderPersonnel(ev.graphic)
                  const wContent = renderPersonnel(ev.writer)
                  const vgContent = renderPersonnel(ev.videographer)
                  const eContent = renderPersonnel(ev.editor)
                  const prContent = renderPersonnel(ev.pr)
                  const dContent = renderPersonnel(ev.dev)

                  return (
                    <div className="mobile-event-card" key={ev.id}>
                      <div className="mobile-event-card-header">
                        <span className="mobile-event-id">{ev.id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span className="mobile-event-date">{formatDateToDisplay(ev.date) || 'No Date'}</span>
                          <button className="remove-assignee-btn" style={{ padding: '0.2rem', color: 'var(--maroon-primary)' }} onClick={() => { setEditingEventItem(ev); setActiveModal('EDIT_EVENT'); }} title="Edit Event">
                            <Edit size={14} />
                          </button>
                          <button className="remove-assignee-btn" style={{ padding: '0.2rem' }} onClick={() => handleDeleteEvent(ev.id)} title="Delete Event">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="mobile-event-title">{ev.name}</h3>
                      <div className="mobile-event-assignments">
                        {pContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Photographer</span>
                            {pContent}
                          </div>
                        )}
                        {gContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Graphic Designer</span>
                            {gContent}
                          </div>
                        )}
                        {wContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Content Writter</span>
                            {wContent}
                          </div>
                        )}
                        {vgContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Videographer</span>
                            {vgContent}
                          </div>
                        )}
                        {eContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Video Editor</span>
                            {eContent}
                          </div>
                        )}
                        {prContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">PR</span>
                            {prContent}
                          </div>
                        )}
                        {dContent && (
                          <div className="assignment-row">
                            <span className="assignment-label">Web Developer</span>
                            {dContent}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      }
      case 'DASHBOARD': {
        const totalEvents = events.length;
        const operationalMembers = members.filter(m => m.year === '1st Year' || m.year === '2nd Year');
        const totalMembers = operationalMembers.length;
        const totalTasksCompleted = operationalMembers.reduce((acc, m) => acc + (m.completed || 0) + getTasksCountForMember(m.name), 0);

        let topMem = null;
        let topCount = -1;
        operationalMembers.forEach(m => {
          const score = (m.completed || 0) + getTasksCountForMember(m.name);
          if (score > topCount && score > 0) {
            topCount = score;
            topMem = m.name;
          }
        });
        const topPerformer = topMem ? `${topMem} (${topCount} Tasks)` : 'No tasks assigned';

        // Domain-specific data
        const domainMembers = operationalMembers.filter(m => m.domain === dashboardDomain);
        const sortedDomainMembers = domainMembers.map(m => {
          const tasks = (m.completed || 0) + getTasksCountForMember(m.name);
          return { name: m.name, tasks };
        }).sort((a, b) => b.tasks - a.tasks);

        const maxDomainTasks = Math.max(...sortedDomainMembers.map(sm => sm.tasks), 0) || 1;

        return (
          <div className="page-layout">
            <header className="page-header">
              <h1 className="page-title">Operational Dashboard</h1>
              <p className="page-subtitle">Track events, analyze members' performance, and monitor active operational domains.</p>
            </header>

            {/* Quick Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-title">Total Events</span>
                <span className="stat-value">{totalEvents}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">Registered Members</span>
                <span className="stat-value">{totalMembers}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">Total Tasks Completed</span>
                <span className="stat-value">{totalTasksCompleted}</span>
              </div>
            </div>

            {/* Domain Wise Bar Graph Card */}
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>Domain Performance Visualizer</h3>
                  <p>Compare member contributions within each domain category.</p>
                </div>
                <select 
                  className="form-input" 
                  style={{ maxWidth: '200px', cursor: 'pointer', height: '38px' }}
                  value={dashboardDomain}
                  onChange={(e) => setDashboardDomain(e.target.value)}
                >
                  <option value="Photographer">Photographer</option>
                  <option value="Graphic Designer">Graphic Designer</option>
                  <option value="Content Writter">Content Writter</option>
                  <option value="Video Editor">Video Editor</option>
                  <option value="Public Relation">Public Relation</option>
                  <option value="Web Developer">Web Developer</option>
                </select>
              </div>

              {sortedDomainMembers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No members currently registered under the "{dashboardDomain}" domain.
                </div>
              ) : (
                <div className="chart-body">
                  {sortedDomainMembers.map((m, idx) => {
                    const percentage = Math.max((m.tasks / maxDomainTasks) * 100, 3); // minimum 3% for visibility
                    return (
                      <div className="chart-row" key={idx}>
                        <div className="chart-member-name" title={m.name}>
                          {m.name}
                        </div>
                        <div className="chart-bar-container">
                          <div 
                            className="chart-bar-fill" 
                            style={{ width: `${percentage}%` }}
                          >
                            {m.tasks > 0 && (
                              <span className="chart-bar-label-inside">
                                {m.tasks}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="chart-value-label">
                          {m.tasks} {m.tasks === 1 ? 'task' : 'tasks'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )
      }
      case 'MEMBER': {
        const filteredMembers = members.filter(m => {
          const matchesSearch = m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
                                m.domain.toLowerCase().includes(memberSearchQuery.toLowerCase());
          const matchesDomain = memberDomainFilter === 'All' || m.domain === memberDomainFilter;
          const matchesYear = memberYearFilter === 'All' || m.year === memberYearFilter;
          return matchesSearch && matchesDomain && matchesYear;
        })

        // Split into the 3 groupings
        const activeMembers = filteredMembers.filter(m => m.year === '1st Year' || m.year === '2nd Year');
        const seniors = filteredMembers.filter(m => m.year === '3rd Year');
        
        const headsOrder = [
          'Team-in-charge',
          'Tresurer',
          'Photography Head',
          'Media Head',
          'Graphics Head',
          'Editor-in-chief',
          'video editing head',
          'Event Head'
        ];
        const heads = filteredMembers
          .filter(m => m.year === '4th Year')
          .sort((a, b) => {
            const idxA = headsOrder.indexOf(a.domain);
            const idxB = headsOrder.indexOf(b.domain);
            const rankA = idxA === -1 ? 999 : idxA;
            const rankB = idxB === -1 ? 999 : idxB;
            return rankA - rankB;
          });

        const renderActiveMembersTable = () => (
          <div className="table-card" style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ padding: '1.25rem 1.5rem 0.5rem', fontSize: '1.1rem', fontWeight: '800', color: 'var(--maroon-primary)', borderBottom: '1px dashed var(--cream-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Active Members (1st & 2nd Year)</span>
              <span style={{ fontSize: '0.8rem', background: 'var(--maroon-primary)', color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>{activeMembers.length} Registered</span>
            </h3>
            <div className="table-scroll-container">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>MEMBER NAME</th>
                    <th>YEAR</th>
                    <th>DOMAIN</th>
                    <th>TASKS COMPLETED</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No operational members to show
                      </td>
                    </tr>
                  ) : (
                    activeMembers.map((member, idx) => (
                      <tr key={member.id || idx}>
                        <td style={{ fontWeight: '700' }}>{member.name}</td>
                        <td>{member.year}</td>
                        <td>
                          <span className="person-badge assigned">
                            {member.domain}
                          </span>
                        </td>
                        <td style={{ fontWeight: '800', color: 'var(--maroon-accent)', paddingLeft: '2.5rem' }}>
                          {(member.completed || 0) + getTasksCountForMember(member.name)}
                        </td>
                        <td>
                          <button className="remove-assignee-btn" style={{ margin: '0 auto' }} onClick={() => handleDeleteMember(member.id, member.name)} title="Delete Member">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

        const renderSeniorsTable = () => (
          <div className="table-card" style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ padding: '1.25rem 1.5rem 0.5rem', fontSize: '1.1rem', fontWeight: '800', color: 'var(--maroon-primary)', borderBottom: '1px dashed var(--cream-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Domain Seniors (3rd Year)</span>
              <span style={{ fontSize: '0.8rem', background: 'var(--maroon-accent)', color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>{seniors.length} Registered</span>
            </h3>
            <div className="table-scroll-container">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>MEMBER NAME</th>
                    <th>DOMAIN</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {seniors.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No domain seniors to show
                      </td>
                    </tr>
                  ) : (
                    seniors.map((member, idx) => (
                      <tr key={member.id || idx}>
                        <td style={{ fontWeight: '700' }}>{member.name}</td>
                        <td>
                          <span className="person-badge assigned" style={{ backgroundColor: 'var(--cream-accent)', color: 'var(--text-dark)', fontWeight: '600' }}>
                            {member.domain}
                          </span>
                        </td>
                        <td>
                          <button className="remove-assignee-btn" style={{ margin: '0 auto' }} onClick={() => handleDeleteMember(member.id, member.name)} title="Delete Member">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

        const renderHeadsTable = () => (
          <div className="table-card" style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ padding: '1.25rem 1.5rem 0.5rem', fontSize: '1.1rem', fontWeight: '800', color: 'var(--maroon-primary)', borderBottom: '1px dashed var(--cream-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Domain Heads (4th Year)</span>
              <span style={{ fontSize: '0.8rem', background: 'gold', color: 'var(--maroon-dark)', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: '700' }}>{heads.length} Registered</span>
            </h3>
            <div className="table-scroll-container">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>DOMAIN</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No domain heads to show
                      </td>
                    </tr>
                  ) : (
                    heads.map((member, idx) => (
                      <tr key={member.id || idx}>
                        <td style={{ fontWeight: '700' }}>{member.name}</td>
                        <td>
                          <span className="person-badge assigned" style={{ background: 'linear-gradient(135deg, var(--maroon-primary), var(--maroon-accent))', color: 'var(--text-light)', fontWeight: '700' }}>
                            {member.domain}
                          </span>
                        </td>
                        <td>
                          <button className="remove-assignee-btn" style={{ margin: '0 auto' }} onClick={() => handleDeleteMember(member.id, member.name)} title="Delete Member">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

        return (
          <div className="page-layout">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 className="page-title">Member Directory</h1>
                <p className="page-subtitle">Database of all active, senior, and heading operational club members.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search members..." 
                  style={{ maxWidth: '200px', padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                />
                <select 
                  className="form-input" 
                  style={{ maxWidth: '160px', padding: '0.55rem 0.85rem', fontSize: '0.85rem', height: '38px', cursor: 'pointer' }}
                  value={memberDomainFilter}
                  onChange={(e) => setMemberDomainFilter(e.target.value)}
                >
                  <option value="All">All Domains</option>
                  <option value="Photographer">Photographer</option>
                  <option value="Graphic Designer">Graphic Designer</option>
                  <option value="Content Writter">Content Writter</option>
                  <option value="Video Editor">Video Editor</option>
                  <option value="Public Relation">Public Relation</option>
                  <option value="Web Developer">Web Developer</option>
                </select>
                <select 
                  className="form-input" 
                  style={{ maxWidth: '130px', padding: '0.55rem 0.85rem', fontSize: '0.85rem', height: '38px', cursor: 'pointer' }}
                  value={memberYearFilter}
                  onChange={(e) => setMemberYearFilter(e.target.value)}
                >
                  <option value="All">All Years</option>
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
                <button className="sheet-action-btn primary" onClick={() => setActiveModal('ADD_MEMBER')}>Add Member</button>
              </div>
            </header>

            {/* Desktop Table View */}
            <div className="desktop-table-view">
              {(memberYearFilter === 'All' || memberYearFilter === '1st Year' || memberYearFilter === '2nd Year') && renderActiveMembersTable()}
              {(memberYearFilter === 'All' || memberYearFilter === '3rd Year') && renderSeniorsTable()}
              {(memberYearFilter === 'All' || memberYearFilter === '4th Year') && renderHeadsTable()}
            </div>

            {/* Mobile Card View */}
            <div className="mobile-cards-view">
              {filteredMembers.length === 0 ? (
                <div className="coming-soon-card" style={{ minHeight: '150px', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, fontWeight: '500' }}>No data to show</p>
                </div>
              ) : (
                filteredMembers.map((member, idx) => (
                  <div className="mobile-event-card" key={member.id || idx}>
                    <div className="mobile-event-card-header">
                      <span className="mobile-event-id">{member.year}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {(member.year === '1st Year' || member.year === '2nd Year') && (
                          <span className="mobile-event-date" style={{ fontWeight: '800', color: 'var(--maroon-accent)' }}>
                            {(member.completed || 0) + getTasksCountForMember(member.name)} Tasks Done
                          </span>
                        )}
                        <button className="remove-assignee-btn" style={{ padding: '0.2rem' }} onClick={() => handleDeleteMember(member.id, member.name)} title="Delete Member">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h3 className="mobile-event-title">{member.name}</h3>
                    <div className="mobile-event-assignments">
                      <div className="assignment-row">
                        <span className="assignment-label">Domain</span>
                        <span className="person-badge assigned" style={{ alignSelf: 'flex-start' }}>
                          {member.domain}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      }
      case 'ACCOUNT': {
        if (!currentUserProfile) {
          return (
            <div className="page-layout">
              <header className="page-header">
                <h1 className="page-title">Profile Settings</h1>
                <p className="page-subtitle">Manage your credentials and view your contribution status.</p>
              </header>
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                No active profile linked. Please claim your profile first.
              </div>
            </div>
          )
        }

        const initials = currentUserProfile.name
          ? currentUserProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
          : '??'

        const totalTasks = (currentUserProfile.completed || 0) + getTasksCountForMember(currentUserProfile.name)
        const userRank = getContributionRank(currentUserProfile.name)
        const recentTasks = getUserRecentAssignments(currentUserProfile.name)

        return (
          <div className="page-layout">
            <header className="page-header">
              <h1 className="page-title">Operational Profile</h1>
              <p className="page-subtitle">View account settings, active domain registration, and personal dashboard metrics.</p>
            </header>

            <div className="account-container">
              {/* Profile card (Left column) */}
              <div className="profile-card">
                <div className="profile-avatar">
                  {initials}
                </div>
                <h2 className="profile-name">{currentUserProfile.name}</h2>
                <div className="profile-domain">{currentUserProfile.domain}</div>
                
                <div className="profile-details">
                  <div className="profile-detail-item">
                    <span className="profile-detail-label">Status</span>
                    <span className="profile-status-badge">Active</span>
                  </div>
                  <div className="profile-detail-item">
                    <span className="profile-detail-label">Academic Year</span>
                    <span className="profile-detail-value">{currentUserProfile.year}</span>
                  </div>
                  <div className="profile-detail-item">
                    <span className="profile-detail-label">Auth Email</span>
                    <span className="profile-detail-value" style={{ wordBreak: 'break-all' }}>{session?.user?.email || 'N/A'}</span>
                  </div>
                  <div className="profile-detail-item">
                    <span className="profile-detail-label">Registration Date</span>
                    <span className="profile-detail-value">
                      {currentUserProfile.created_at ? new Date(currentUserProfile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : 'N/A'}
                    </span>
                  </div>
                </div>

                <button className="profile-sign-out-btn" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>

              {/* Personal Dashboard panel (Right column) */}
              <div className="personal-dashboard-card">
                <h3>My Dashboard</h3>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '1.5rem' }}>
                  <div className="stat-card" style={{ padding: '1.25rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.75rem' }}>My Tasks Completed</span>
                    <span className="stat-value" style={{ fontSize: '1.75rem' }}>
                      {currentUserProfile.year === '3rd Year' || currentUserProfile.year === '4th Year' ? 'N/A' : totalTasks}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '1.25rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.75rem' }}>Contribution Rank</span>
                    <span className="stat-value" style={{ fontSize: '1.75rem' }}>
                      {currentUserProfile.year === '3rd Year' || currentUserProfile.year === '4th Year' ? 'N/A' : userRank}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '1.25rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.75rem' }}>Current Month Target</span>
                    <span className="stat-value" style={{ fontSize: '1.75rem' }}>70%</span>
                  </div>
                </div>

                <h4 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--maroon-primary)', marginBottom: '0.75rem' }}>Recent Assignments</h4>
                <div className="personal-recent-tasks">
                  {recentTasks.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', background: 'var(--cream-bg)', borderRadius: '8px', border: '1px solid var(--cream-accent)' }}>
                      No recent assignments found.
                    </div>
                  ) : (
                    recentTasks.map((t, idx) => (
                      <div className="personal-task-row" key={idx}>
                        <div className="personal-task-info">
                          <span className="personal-task-name">{t.name}</span>
                          <span className="personal-task-meta">Date: {t.date || 'N/A'}</span>
                        </div>
                        <span className="personal-task-role">{t.role} ({t.type})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
      default:
        return null
    }
  }

  if (authLoading) {
    return (
      <div className="auth-loader-container">
        <div className="auth-spinner"></div>
        <p style={{ color: 'var(--text-dark)', fontWeight: '600' }}>Loading user session...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-page-container">
        <div className="auth-split-layout">
          {/* Left Section: Information about the app (No login needed) */}
          <div className="auth-info-section">
            <div className="info-brand-header">
              <img 
                src="https://i.pinimg.com/736x/8f/ee/e8/8feee89e30a4018e9255f60e6e2a7eae.jpg" 
                alt="Hitian Inside Logo" 
                className="info-brand-logo"
              />
              <span className="info-brand-title">Hitian Inside</span>
            </div>
            
            <h2 className="info-main-title">Hitian Inside Management</h2>
            <p className="info-tagline">
              The central operations, events, and performance tracking platform for the Hitian Inside club.
            </p>

            <div className="info-features-grid">
              <div className="info-feature-card">
                <h4>Event Coordination</h4>
                <p>Manage scheduling, operational roles, photographer/writer/designer assignments, and workflows for upcoming match streams and community events.</p>
              </div>
              <div className="info-feature-card">
                <h4>Performance Sheets</h4>
                <p>Track contribution history, task volumes, and completion rankings dynamically with clean, sortable spreadsheets.</p>
              </div>
              <div className="info-feature-card">
                <h4>Domain Analytics</h4>
                <p>Visualize operational workload and team capacities across photography, graphics, content writing, PR, and dev domains.</p>
              </div>
            </div>
          </div>

          {/* Right Section: Glassmorphic Auth card */}
          <div className="auth-card-section">
            <div className="auth-glass-card">
              <div className="auth-logo" style={{ overflow: 'hidden' }}>
                <img 
                  src="https://i.pinimg.com/736x/8f/ee/e8/8feee89e30a4018e9255f60e6e2a7eae.jpg" 
                  alt="App Logo" 
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              </div>
              <h1 className="auth-title">Sign In</h1>
              <p className="auth-subtitle">
                Welcome to Hitian Inside Management.<br />
                Use your registered Google account to access your workspace.
              </p>
              <button className="google-login-btn" onClick={handleGoogleLogin}>
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.99 1 12 1 7.28 1 3.25 3.75 1.25 7.77l3.92 3.04c.93-2.8 3.54-4.77 6.83-4.77z"/>
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.57-5.17 3.57-8.71z"/>
                  <path fill="#FBBC05" d="M5.17 14.77c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27L1.25 7.19C.45 8.79 0 10.59 0 12.5s.45 3.71 1.25 5.31l3.92-3.04z"/>
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.86-2.98c-1.08.72-2.45 1.15-4.1 1.15-3.29 0-5.9-1.97-6.83-4.77l-3.92 3.04C3.25 20.25 7.28 23 12 23z"/>
                </svg>
                Sign in with Google
              </button>
              
              <div style={{ marginTop: '2rem', fontSize: '0.85rem', opacity: '0.7' }}>
                <span 
                  style={{ textDecoration: 'underline', cursor: 'pointer', color: 'rgba(255,255,255,0.8)' }}
                  onClick={() => setShowPrivacyModal(true)}
                >
                  Privacy Policy
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (onboardingStep > 0) {
    const unclaimedMembers = members.filter(m => m.year === selectedOnboardingYear && !m.user_id)

    return (
      <div className="auth-page-container">
        <div className="auth-glass-card">
          <div className="auth-logo">
            <UserPlus size={36} />
          </div>
          <h1 className="auth-title">Setup Profile</h1>
          
          <div className="onboarding-steps">
            <div className={`onboarding-step-dot ${onboardingStep === 1 ? 'active' : ''}`}></div>
            <div className={`onboarding-step-dot ${onboardingStep === 2 ? 'active' : ''}`}></div>
          </div>

          {onboardingStep === 1 && (
            <div>
              <p className="auth-subtitle">Select your academic year to match your profile.</p>
              
              <div className="onboarding-year-grid">
                {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((yr) => (
                  <div 
                    key={yr}
                    className={`onboarding-year-card ${selectedOnboardingYear === yr ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedOnboardingYear(yr)
                      if (yr === '4th Year') {
                        setNewOnboardingMemberDomain('Team-in-charge')
                      } else {
                        setNewOnboardingMemberDomain('Photographer')
                      }
                    }}
                  >
                    {yr}
                  </div>
                ))}
              </div>

              <div className="onboarding-action-row">
                <button className="onboarding-btn secondary" onClick={() => setSession(null)}>Cancel</button>
                <button className="onboarding-btn primary" onClick={() => setOnboardingStep(2)}>Next</button>
              </div>
            </div>
          )}

          {onboardingStep === 2 && (
            <div>
              <p className="auth-subtitle">
                Select your name from the unclaimed <strong>{selectedOnboardingYear}</strong> list.
              </p>

              {!showAddInOnboarding ? (
                <>
                  <div className="onboarding-claim-list">
                    {unclaimedMembers.length === 0 ? (
                      <div style={{ padding: '2rem', fontStyle: 'italic', opacity: '0.6' }}>
                        No unclaimed members found for {selectedOnboardingYear}.
                      </div>
                    ) : (
                      unclaimedMembers.map((m, idx) => (
                        <div 
                          key={idx}
                          className={`onboarding-claim-item ${selectedClaimName === m.name ? 'selected' : ''}`}
                          onClick={() => setSelectedClaimName(m.name)}
                        >
                          <span className="onboarding-claim-name">{m.name}</span>
                          <span className="onboarding-claim-domain">{m.domain}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                    Don't see your name?{' '}
                    <span 
                      style={{ color: 'var(--gold)', cursor: 'pointer', fontWeight: '700', textDecoration: 'underline' }}
                      onClick={() => setShowAddInOnboarding(true)}
                    >
                      Create a new profile
                    </span>
                  </div>

                  <div className="onboarding-action-row">
                    <button className="onboarding-btn secondary" onClick={() => setOnboardingStep(1)}>Back</button>
                    <button 
                      className="onboarding-btn primary" 
                      disabled={!selectedClaimName}
                      onClick={() => handleClaimProfile(selectedClaimName)}
                    >
                      Claim Profile
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.15)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <h4 style={{ color: 'var(--gold)', marginBottom: '1rem', fontSize: '0.95rem' }}>Register New Profile</h4>
                  
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', opacity: '0.8', display: 'block', marginBottom: '0.25rem' }}>Your Full Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Priyanshu Raj" 
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px' }}
                      value={newOnboardingMemberName}
                      onChange={(e) => setNewOnboardingMemberName(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.8rem', opacity: '0.8', display: 'block', marginBottom: '0.25rem' }}>Domain</label>
                    <select 
                      className="form-input" 
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                      value={newOnboardingMemberDomain}
                      onChange={(e) => setNewOnboardingMemberDomain(e.target.value)}
                    >
                      {selectedOnboardingYear === '4th Year' ? (
                        <>
                          <option value="Team-in-charge">Team-in-charge</option>
                          <option value="Tresurer">Tresurer</option>
                          <option value="Photography Head">Photography Head</option>
                          <option value="Media Head">Media Head</option>
                          <option value="Graphics Head">Graphics Head</option>
                          <option value="Editor-in-chief">Editor-in-chief</option>
                          <option value="video editing head">video editing head</option>
                          <option value="Event Head">Event Head</option>
                        </>
                      ) : (
                        <>
                          <option value="Photographer">Photographer</option>
                          <option value="Graphic Designer">Graphic Designer</option>
                          <option value="Content Writter">Content Writter</option>
                          <option value="Video Editor">Video Editor</option>
                          <option value="Public Relation">Public Relation</option>
                          <option value="Web Developer">Web Developer</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="onboarding-action-row">
                    <button className="onboarding-btn secondary" onClick={() => setShowAddInOnboarding(false)}>Back to List</button>
                    <button 
                      className="onboarding-btn primary" 
                      onClick={handleCreateAndClaimProfile}
                    >
                      Register & Claim
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`app-container ${isFocusMode ? 'focus-mode-active' : ''}`}>
      {/* Mobile Sidebar Overlay Backdrop */}
      {isMobileExpanded && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setIsMobileExpanded(false)}
        ></div>
      )}

      {/* Sidebar Navigation */}
      <aside 
        className={`sidebar ${isMobileExpanded ? 'mobile-expanded' : ''}`}
        onClick={() => {
          if (!isMobileExpanded && window.innerWidth <= 768) {
            setIsMobileExpanded(true)
          }
        }}
      >
        <div className="sidebar-brand">
          <div className="brand-logo-container">
            <div className="brand-icon"></div>
          </div>
          <span className="brand-text">HITIAN INSIDE</span>
          
          {window.innerWidth <= 768 && isMobileExpanded && (
            <button 
              className="mobile-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsMobileExpanded(false);
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        
        <ul className="sidebar-nav">
          {navItems.map((item) => {
            const IconComponent = item.icon
            return (
              <li 
                key={item.id} 
                className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActivePage(item.id)
                  if (window.innerWidth <= 768) {
                    setIsMobileExpanded(false)
                  }
                }}
              >
                <div className="nav-icon-wrapper">
                  <IconComponent size={20} />
                </div>
                <span className="nav-label">{item.label}</span>
              </li>
            )
          })}
        </ul>

        <div className="sidebar-footer">
          <div className="footer-system-label" style={{ cursor: 'pointer', textDecoration: 'underline', marginBottom: '0.5rem' }} onClick={() => setShowPrivacyModal(true)}>
            PRIVACY POLICY
          </div>
          <div className="footer-system-label">OPERATIONS CONTROL</div>
          <div className="footer-system-val">V2.0.0 ACTIVE</div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content" onClick={() => {
        setIsMobileExpanded(false)
        setIsFabOpen(false)
      }}>
        <div key={activePage} className="page-transition-wrapper">
          {renderContent()}
        </div>
      </main>

      {/* Floating Action Button Speed Dial */}
      <div className="fab-container">
        {isFabOpen && (
          <div className="fab-options">
            <div className="fab-option-item" onClick={() => { setActiveModal('ADD_MEMBER'); setIsFabOpen(false); }}>
              <span className="fab-option-label">Add Member</span>
              <button className="fab-mini-btn"><UserPlus size={18} /></button>
            </div>
            <div className="fab-option-item" onClick={() => { setActiveModal('ADD_EVENT'); setIsFabOpen(false); }}>
              <span className="fab-option-label">Add Event</span>
              <button className="fab-mini-btn"><FolderPlus size={18} /></button>
            </div>
          </div>
        )}
        <button 
          className={`fab-trigger ${isFabOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setIsFabOpen(!isFabOpen)
          }}
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {navItems.map((item) => {
          const IconComponent = item.icon
          return (
            <div 
              key={item.id} 
              className={`mobile-bottom-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <IconComponent size={20} />
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </div>
          )
        })}
      </nav>

      {/* 2. Modals Implementation */}
      {activeModal === 'ADD_EVENT' && (
        <AddEventModal 
          onClose={() => setActiveModal(null)} 
          onAdd={async (newEvent) => {
            try {
              const { data, error } = await supabase
                .from('events')
                .insert([newEvent])
                .select()
              if (error) throw error
              if (data && data[0]) {
                setEvents(prevEvents => [data[0], ...prevEvents])
                setToastMessage(`Event "${data[0].name}" (${data[0].id}) created successfully!`)
                return true
              }
              return false
            } catch (err) {
              alert('Error saving event to Supabase: ' + err.message)
              return false
            }
          }}
        />
      )}

      {activeModal === 'ADD_MEMBER' && (
        <AddMemberModal 
          onClose={() => setActiveModal(null)} 
          onAdd={async (newMember) => {
            try {
              const { data, error } = await supabase
                .from('members')
                .insert([newMember])
                .select()
              if (error) throw error
              if (data && data[0]) {
                setMembers(prev => [...prev, data[0]].sort((a, b) => a.name.localeCompare(b.name)))
                setToastMessage(`Member "${data[0].name}" registered successfully!`)
                return true
              }
              return false
            } catch (err) {
              alert('Error registering member in Supabase: ' + err.message)
              return false
            }
          }}
        />
      )}

      {activeModal === 'EDIT_CELL' && editingCellInfo && (
        <EditCellModal 
          cellInfo={editingCellInfo} 
          events={events}
          members={members}
          getDomainFromKey={getDomainFromKey}
          onClose={() => {
            setActiveModal(null)
            setEditingCellInfo(null)
          }} 
          onSave={async (updatedPersonnel) => {
            try {
              const val = updatedPersonnel.length > 0 ? updatedPersonnel : null
              const { error } = await supabase
                .from('events')
                .update({ [editingCellInfo.domainKey]: val })
                .eq('id', editingCellInfo.eventId)
              if (error) throw error

              setEvents(events.map(ev => {
                if (ev.id === editingCellInfo.eventId) {
                  return { ...ev, [editingCellInfo.domainKey]: val }
                }
                return ev
              }))
              setActiveModal(null)
              setEditingCellInfo(null)
            } catch (err) {
              alert('Error saving assignments: ' + err.message)
            }
          }}
        />
      )}

      {activeModal === 'EDIT_EVENT' && editingEventItem && (
        <EditEventModal 
          eventItem={editingEventItem}
          onClose={() => {
            setActiveModal(null)
            setEditingEventItem(null)
          }}
          onSave={async (updatedEvent) => {
            try {
              const { error } = await supabase
                .from('events')
                .update({ name: updatedEvent.name, date: updatedEvent.date })
                .eq('id', updatedEvent.id)
              if (error) throw error

              setEvents(events.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev))
              setActiveModal(null)
              setEditingEventItem(null)
            } catch (err) {
              alert('Error updating event in Supabase: ' + err.message)
            }
          }}
        />
      )}
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
      {showPrivacyModal && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-box" style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Privacy Policy</h3>
              <button className="modal-close" onClick={() => setShowPrivacyModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body-content" style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-dark)', textAlign: 'left', padding: '1rem 0' }}>
              <p>Last updated: June 23, 2026</p>
              <p style={{ marginTop: '0.75rem' }}>This Privacy Policy describes how <strong>Hitian Inside Management</strong> collects, uses, and shares your information when you use our web application to log in via Google OAuth.</p>
              
              <h4 style={{ marginTop: '1.25rem', fontWeight: '800', color: 'var(--maroon-primary)' }}>1. Information We Collect</h4>
              <p>When you log in using your Google Account, we retrieve your email address, full name, profile picture, and Google User ID.</p>
              
              <h4 style={{ marginTop: '1.25rem', fontWeight: '800', color: 'var(--maroon-primary)' }}>2. How We Use Your Information</h4>
              <p>We use this information to authenticate your session, match your credentials to your database profile roster card, and track task contributions securely.</p>
              <p>We do not use your information for marketing and we never share it with third parties.</p>
              
              <h4 style={{ marginTop: '1.25rem', fontWeight: '800', color: 'var(--maroon-primary)' }}>3. Data Retention & Deletion</h4>
              <p>Data is stored securely for account operations. You can request record unlinking or account deletion at any time by contacting the administrator.</p>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn-primary" onClick={() => setShowPrivacyModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ================= MODAL COMPONENTS =================

function AddEventModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const randomId = `E-${Math.floor(1000 + Math.random() * 9000)}`
    const formattedDate = date ? formatDateToDB(date) : new Date().toISOString().split('T')[0]
    const newEvent = {
      id: randomId,
      name: name.trim(),
      date: formattedDate,
      photographer: null,
      graphic: null,
      writer: null,
      videographer: null,
      editor: null,
      pr: null,
      dev: null
    }
    const success = await onAdd(newEvent)
    if (success) {
      setName('')
      setDate('')
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Create New Event</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Event Name *</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Autumn Fest 2026"
              required 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label>Event Date (DD/MM/YYYY or DDMMYYYY, Optional)</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 17052026 or 17/05/2026"
              pattern="(\d{8}|\d{2}[-/]\d{2}[-/]\d{4})"
              title="Please enter as DDMMYYYY (e.g. 17052026) or DD/MM/YYYY (e.g. 17/05/2026)"
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            <button type="submit" className="btn-primary">Add Event</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditEventModal({ eventItem, onClose, onSave }) {
  const [name, setName] = useState(eventItem.name)
  const [date, setDate] = useState(formatDateToDisplay(eventItem.date))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const updatedEvent = {
      ...eventItem,
      name: name.trim(),
      date: formatDateToDB(date)
    }
    onSave(updatedEvent)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Edit Event Details</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Event Name *</label>
            <input 
              type="text" 
              className="form-input" 
              required 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label>Event Date (DD/MM/YYYY or DDMMYYYY, Optional)</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 17052026 or 17/05/2026"
              pattern="(\d{8}|\d{2}[-/]\d{2}[-/]\d{4})"
              title="Please enter as DDMMYYYY (e.g. 17052026) or DD/MM/YYYY (e.g. 17/05/2026)"
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddMemberModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState('1st Year')
  const [domain, setDomain] = useState('Photographer')
  const [completed, setCompleted] = useState(0)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const newMember = {
      name: name.trim(),
      year,
      domain,
      completed: parseInt(completed) || 0
    }
    const success = await onAdd(newMember)
    if (success) {
      setName('')
      setCompleted(0)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Register New Member</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Member Name *</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Sayan Maity"
              required 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label>Academic Year</label>
            <select 
              className="form-input" 
              value={year} 
              onChange={(e) => {
                const newYear = e.target.value
                setYear(newYear)
                if (newYear === '4th Year') {
                  setDomain('Team-in-charge')
                } else {
                  setDomain('Photographer')
                }
              }}
            >
              <option>1st Year</option>
              <option>2nd Year</option>
              <option>3rd Year</option>
              <option>4th Year</option>
            </select>
          </div>
          <div className="form-group">
            <label>Domain</label>
            <select className="form-input" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {year === '4th Year' ? (
                <>
                  <option value="Team-in-charge">Team-in-charge</option>
                  <option value="Tresurer">Tresurer</option>
                  <option value="Photography Head">Photography Head</option>
                  <option value="Media Head">Media Head</option>
                  <option value="Graphics Head">Graphics Head</option>
                  <option value="Editor-in-chief">Editor-in-chief</option>
                  <option value="video editing head">video editing head</option>
                  <option value="Event Head">Event Head</option>
                </>
              ) : (
                <>
                  <option value="Photographer">Photographer</option>
                  <option value="Graphic Designer">Graphic Designer</option>
                  <option value="Content Writter">Content Writter</option>
                  <option value="Video Editor">Video Editor</option>
                  <option value="Public Relation">Public Relation</option>
                  <option value="Web Developer">Web Developer</option>
                </>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Initial Tasks Completed</label>
            <input 
              type="number" 
              min="0"
              className="form-input" 
              value={completed} 
              onChange={(e) => setCompleted(e.target.value)} 
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            <button type="submit" className="btn-primary">Add Member</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditCellModal({ cellInfo, events, members, getDomainFromKey, onClose, onSave }) {
  const { eventId, domainKey } = cellInfo
  const currentEvent = events.find(ev => ev.id === eventId)
  const targetDomainName = getDomainFromKey(domainKey)
  
  // Get members registered for this target domain
  const domainFilteredMembers = members.filter(m => m.domain === targetDomainName)
  
  // Local state for assignees list
  const [localPersonnelList, setLocalPersonnelList] = useState(
    currentEvent[domainKey] ? [...currentEvent[domainKey]] : []
  )
  
  // New assignee states
  const [selectedName, setSelectedName] = useState('')
  const [selectedType, setSelectedType] = useState('assigned')

  useEffect(() => {
    if (domainFilteredMembers.length > 0 && !selectedName) {
      setSelectedName(domainFilteredMembers[0].name)
    }
  }, [domainFilteredMembers, selectedName])

  const handleAddAssignee = () => {
    if (!selectedName) return
    // Check if already assigned
    if (localPersonnelList.find(p => p.name === selectedName)) {
      alert("Member already assigned to this role!")
      return
    }
    setLocalPersonnelList([...localPersonnelList, { name: selectedName, type: selectedType }])
  }

  const handleRemoveAssignee = (name) => {
    setLocalPersonnelList(localPersonnelList.filter(p => p.name !== name))
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box editing-cell-box">
        <div className="modal-header">
          <div>
            <h3>Assign {targetDomainName}s</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Event: <strong>{currentEvent.name}</strong> ({eventId})
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body-content">
          {/* Current Assignees */}
          <div className="assignees-section">
            <h4>Current Personnel</h4>
            {localPersonnelList.length === 0 ? (
              <p className="no-personnel-label">No personnel assigned to this domain.</p>
            ) : (
              <div className="assignee-edit-list">
                {localPersonnelList.map((p, idx) => (
                  <div key={idx} className="assignee-edit-row">
                    <span className={`person-badge ${p.type}`}>{p.name}</span>
                    <button className="remove-assignee-btn" onClick={() => handleRemoveAssignee(p.name)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--cream-accent)', margin: '1.5rem 0' }} />

          {/* Add New Assignee Form */}
          <div className="add-assignee-form">
            <h4>Add Personnel</h4>
            {domainFilteredMembers.length === 0 ? (
              <p className="no-personnel-label">No members registered in {targetDomainName} domain.</p>
            ) : (
              <div className="add-assignee-inputs">
                <div className="form-group">
                  <label>Select Member</label>
                  <select 
                    className="form-input" 
                    value={selectedName} 
                    onChange={(e) => setSelectedName(e.target.value)}
                  >
                    {domainFilteredMembers.map((m, idx) => (
                      <option key={idx} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Role Type</label>
                  <select 
                    className="form-input" 
                    value={selectedType} 
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="assigned">Assigned (Primary)</option>
                    <option value="replacement">Replacement</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <button 
                  type="button" 
                  className="sheet-action-btn primary" 
                  style={{ width: '100%', marginTop: '0.5rem' }} 
                  onClick={handleAddAssignee}
                >
                  + Add to Event
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: '2rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => onSave(localPersonnelList)}>Save Assignments</button>
        </div>
      </div>
    </div>
  )
}

export default App
