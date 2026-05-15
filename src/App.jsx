import React, { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  TrendingUp, 
  Clock, 
  Search, 
  Bell, 
  Rocket, 
  Plus, 
  Filter, 
  Check, 
  Trash2, 
  Edit2, 
  UserCircle,
  FileText,
  Download,
  CalendarDays,
  Lock,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserX,
  ShieldAlert,
  AlertTriangle,
  Menu,
  X
} from 'lucide-react'
import { auth, db, googleProvider } from './firebase'
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [events, setEvents] = useState([])
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setUser(user)
          await fetchUserData(user)
        } else {
          setUser(null)
          setUserData(null)
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const fetchUserData = async (authUser) => {
    try {
      const userRef = doc(db, 'users', authUser.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        const data = userSnap.data()
        setUserData(data)
        
        // Fix for existing superadmin missing from student list
        if (data.email === 'jcsayan7@gmail.com' && data.role === 'superadmin') {
          const studentQuery = query(collection(db, 'students'), where('roll', '==', 'SUPERADMIN'))
          const studentSnap = await getDocs(studentQuery)
          if (studentSnap.empty) {
            await addDoc(collection(db, 'students'), {
              name: 'Sayan Maity',
              roll: 'SUPERADMIN',
              domain: 'Development',
              year: 'N/A',
              availability: 'Operational',
              statusNote: 'System Superadmin'
            })
          } else {
            // Update name if it was previously set incorrectly (e.g. Sayan Das)
            const existingDoc = studentSnap.docs[0]
            if (existingDoc.data().name !== 'Sayan Maity') {
              await updateDoc(doc(db, 'students', existingDoc.id), { name: 'Sayan Maity' })
            }
          }
        }
      } else if (authUser.email === 'jcsayan7@gmail.com') {
        // Auto-init superadmin
        const newAdmin = {
          uid: authUser.uid,
          email: authUser.email,
          name: 'Sayan Maity',
          role: 'superadmin',
          status: 'verified',
          domain: 'Development'
        }
        await setDoc(userRef, newAdmin)
        
        // Also ensure superadmin is in the student list
        const studentQuery = query(collection(db, 'students'), where('roll', '==', 'SUPERADMIN'))
        const studentSnap = await getDocs(studentQuery)
        if (studentSnap.empty) {
          await addDoc(collection(db, 'students'), {
            name: 'Sayan Maity',
            roll: 'SUPERADMIN',
            domain: 'Development',
            year: 'N/A',
            availability: 'Operational',
            statusNote: 'System Superadmin'
          })
        }

        setUserData(newAdmin)
      } else {
        // User exists in Auth but not in Firestore yet
        setUserData({ status: 'new' })
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
      // If we can't fetch data, we should at least let the user try to re-link or see the form
      setUserData({ status: 'new' })
    }
  }

  // Firestore Sync
  useEffect(() => {
    if (!user || (userData?.status !== 'verified')) return

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })))
    })

    const unsubEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })))
    })

    return () => {
      unsubStudents()
      unsubEvents()
    }
  }, [user, userData])

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Login failed:", error)
    }
  }

  const handleLogout = () => signOut(auth)

  const addStudent = async (newStudent) => {
    await addDoc(collection(db, 'students'), newStudent)
  }

  const editStudent = async (updatedStudent) => {
    const { id, ...data } = updatedStudent
    await updateDoc(doc(db, 'students', id), data)
  }

  const deleteStudent = async (id) => {
    if (confirm('Are you sure you want to delete this student record?')) {
      await deleteDoc(doc(db, 'students', id))
    }
  }

  const addEvent = async (newEvent) => {
    await addDoc(collection(db, 'events'), { 
      ...newEvent, 
      assignments: {
        photographer: 'Unassigned',
        contentWriter: 'Unassigned',
        pr: 'Unassigned',
        videoEditor: 'Unassigned',
        graphicDesigner: 'Unassigned',
        webDev: 'Unassigned'
      },
      checklist: {
        membersAssigned: false,
        photosSorted: false,
        photosVerified: false,
        graphicDesignDone: false,
        postVerified: false,
        postDone: false
      }
    })
  }

  const updateEvent = async (eventId, updatedEvent) => {
    const { id, ...data } = updatedEvent
    await updateDoc(doc(db, 'events', eventId), data)
  }

  const deleteEvent = async (id) => {
    if (confirm('Are you sure you want to delete this event? This will remove all associated task tracking.')) {
      await deleteDoc(doc(db, 'events', id))
    }
  }

  const updateMemberStatus = async (availability, statusNote) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), { availability, statusNote })
      setUserData(prev => ({ ...prev, availability, statusNote }))
      
      // Attempt to sync with student record if roll number matches
      if (userData?.roll) {
        const q = query(collection(db, 'students'), where('roll', '==', userData.roll))
        const snap = await getDocs(q)
        if (!snap.empty) {
          await updateDoc(doc(db, 'students', snap.docs[0].id), { availability, statusNote })
        }
      }
    } catch (error) {
      console.error("Status Update Error:", error)
      alert("Failed to update status. Check connection.")
    }
  }

  const updateProfileInfo = async (profileData) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), profileData)
      setUserData(prev => ({ ...prev, ...profileData }))
      alert("Profile updated successfully!")
    } catch (error) {
      console.error("Profile Update Error:", error)
      alert("Failed to update profile information.")
    }
  }

  const isSuperadmin = userData?.role === 'superadmin'
  const isAdmin = userData?.role === 'admin' || isSuperadmin
  const isMember = userData?.role === 'member'

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardHome 
            studentsCount={students.length} 
            eventsCount={events.length} 
            user={userData}
            events={events}
            onUpdateEvent={updateEvent}
          />
        )
      case 'students':
        return (
          <StudentsView 
            students={students} 
            events={events}
            onAddStudent={isAdmin ? addStudent : null} 
            onEditStudent={isAdmin ? editStudent : null}
            onDeleteStudent={isSuperadmin ? deleteStudent : null}
            readOnly={!isAdmin}
          />
        )
      case 'events':
        return (
          <EventsView 
            events={events} 
            students={students} 
            onAddEvent={isAdmin ? addEvent : null} 
            onUpdateEvent={updateEvent} 
            onDeleteEvent={isSuperadmin ? deleteEvent : null}
            user={userData}
          />
        )
      case 'sheets':
        return isAdmin ? <PerformanceSheet students={students} events={events} /> : <NoAccessView />
      case 'users':
        return isSuperadmin ? <UserVerificationView onAddStudent={addStudent} /> : <NoAccessView />
      case 'profile':
        return (
          <ProfileView 
            user={userData} 
            onLogout={handleLogout} 
            updateMemberStatus={updateMemberStatus} 
            updateProfileInfo={updateProfileInfo}
          />
        )
      default:
        return (
          <DashboardHome 
            studentsCount={students.length} 
            eventsCount={events.length} 
            user={userData}
            events={events}
            onUpdateEvent={updateEvent}
          />
        )
    }
  }

  if (loading) return <div className="loading-screen">INITIALIZING SYSTEM...</div>
  if (!user) return <LoginScreen onLogin={handleLogin} />
  if (!userData || userData.status === 'pending' || userData.status === 'new') {
    return <VerificationScreen user={user} userData={userData} onRefresh={() => fetchUserData(user)} />
  }

  return (
    <div className="app-layout">
      {isMenuOpen && <div className="sidebar-overlay-active" onClick={() => setIsMenuOpen(false)}></div>}
      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Rocket size={24} />
          <span className="logo-text">HITIAN INSIDE</span>
        </div>
        
        <nav className="sidebar-nav">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="DASHBOARD" 
            active={activeTab === 'dashboard'} 
            onClick={() => {
              setActiveTab('dashboard')
              setIsMenuOpen(false)
            }} 
          />
          <NavItem 
            icon={<Users size={20} />} 
            label="STUDENTS" 
            active={activeTab === 'students'} 
            onClick={() => {
              setActiveTab('students')
              setIsMenuOpen(false)
            }} 
          />
          <NavItem 
            icon={<Calendar size={20} />} 
            label="EVENTS" 
            active={activeTab === 'events'} 
            onClick={() => {
              setActiveTab('events')
              setIsMenuOpen(false)
            }} 
          />
          {isAdmin && (
            <NavItem 
              icon={<FileText size={20} />} 
              label="SHEETS" 
              active={activeTab === 'sheets'} 
              onClick={() => {
                setActiveTab('sheets')
                setIsMenuOpen(false)
              }} 
            />
          )}
          {isSuperadmin && (
            <NavItem 
              icon={<ShieldCheck size={20} />} 
              label="VERIFY USERS" 
              active={activeTab === 'users'} 
              onClick={() => {
                setActiveTab('users')
                setIsMenuOpen(false)
              }} 
            />
          )}
          <NavItem 
            icon={<UserCircle size={20} />} 
            label="PROFILE" 
            active={activeTab === 'profile'} 
            onClick={() => {
              setActiveTab('profile')
              setIsMenuOpen(false)
            }} 
          />
        </nav>

        <div className="sidebar-footer" style={{ marginTop: 'auto', borderTop: '1px solid var(--maroon-light)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>
            <p style={{ marginBottom: '0.5rem' }}>FIREBASE CLOUD ACTIVE</p>
            <div className="progress-container" style={{ height: '8px', background: 'var(--maroon-light)' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--cream)' }}></div>
            </div>
            <p style={{ marginTop: '0.5rem' }}>SECURE SESSION: {user.email.split('@')[0].toUpperCase()}</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--maroon)', paddingBottom: '1rem', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>
            <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
              MENU
            </button>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--maroon)' }} />
              <input 
                type="text" 
                placeholder="Search database..." 
                className="input-field" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="premium-btn" style={{ padding: '8px' }}>
              <Bell size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '32px', height: '32px', background: 'var(--maroon)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                {userData.name[0]}
              </div>
              <div className="header-user-info" style={{ display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>{userData.name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--maroon)', fontWeight: 600 }}>{userData.role.toUpperCase()}</p>
              </div>
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}

// New Components for Auth and Role management

function LoginScreen({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <Rocket size={48} color="var(--maroon)" style={{ marginBottom: '1.5rem' }} />
        <h1>HITIAN INSIDE</h1>
        <p>MANAGEMENT PORTAL GATEWAY</p>
        <div style={{ borderTop: '1px solid var(--maroon)', width: '100%', margin: '1.5rem 0' }}></div>
        <button className="premium-btn login-btn" onClick={onLogin}>
          <img src="https://www.google.com/favicon.ico" alt="Google" width="18" />
          SIGN IN WITH GOOGLE
        </button>
        <p style={{ fontSize: '0.7rem', marginTop: '1.5rem', color: '#666', fontWeight: 600 }}>
          AUTHORIZED PERSONNEL ONLY. SYSTEM ACCESS IS LOGGED.
        </p>
      </div>
    </div>
  )
}

function VerificationScreen({ user, userData, onRefresh }) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !domain || isSubmitting) return
    
    setIsSubmitting(true)
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        name: name,
        domain: domain,
        role: 'member',
        status: 'pending',
        createdAt: new Date().toISOString()
      })
      setIsSubmitted(true)
    } catch (error) {
      console.error("Verification submission failed:", error)
      alert("Failed to submit request. Please check your internet connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted || userData?.status === 'pending') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <Clock size={48} color="var(--maroon)" style={{ marginBottom: '1.5rem' }} />
          <h1>PENDING VERIFICATION</h1>
          <p>Request submitted for {user.email}</p>
          <div style={{ padding: '1rem', border: '1px solid var(--maroon)', margin: '1.5rem 0', background: 'var(--cream-dark)' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              Your account is awaiting approval from Superadmin (Sayan Das).
              Please contact the development team if this takes more than 24 hours.
            </p>
          </div>
          <button className="premium-btn" onClick={onRefresh}>
            CHECK STATUS
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <ShieldAlert size={48} color="var(--maroon)" style={{ marginBottom: '1.5rem' }} />
        <h1>LINK ACCOUNT</h1>
        <p>Initialize your member profile</p>
        <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="role-label">CHOOSE YOUR IDENTITY</label>
            <input 
              type="text" 
              placeholder="Full Name" 
              className="input-field" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="role-label">DOMAIN / DEPARTMENT</label>
            <select 
              className="select-field" 
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            >
              <option value="">Select Domain</option>
              <option value="Photography">Photography</option>
              <option value="Content Writing">Content Writing</option>
              <option value="Graphic Design">Graphic Design</option>
              <option value="Video Editing">Video Editing</option>
              <option value="Social Media">Social Media</option>
              <option value="PR">PR</option>
              <option value="Management">Management</option>
              <option value="Web/App Developer">Web/App Developer</option>
            </select>
          </div>
          <button type="submit" className="premium-btn" style={{ width: '100%' }} disabled={isSubmitting}>
            {isSubmitting ? 'COMMUNICATING WITH SERVER...' : 'SUBMIT FOR VERIFICATION'}
          </button>
        </form>
      </div>
    </div>
  )
}

function UserVerificationView({ onAddStudent }) {
  const [pendingUsers, setPendingUsers] = useState([])
  const [stagedChanges, setStagedChanges] = useState({}) // { userId: { role: 'member' | 'admin' | 'rejected' } }
  const [isCommitting, setIsCommitting] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })))
    })
    return () => unsubscribe()
  }, [])

  const stageVerify = (userId, asAdmin) => {
    setStagedChanges(prev => ({
      ...prev,
      [userId]: { type: 'verify', role: asAdmin ? 'admin' : 'member' }
    }))
  }

  const stageReject = (userId) => {
    setStagedChanges(prev => ({
      ...prev,
      [userId]: { type: 'reject' }
    }))
  }

  const clearStage = (userId) => {
    const newStaged = { ...stagedChanges }
    delete newStaged[userId]
    setStagedChanges(newStaged)
  }

  const handleCommit = async () => {
    setIsCommitting(true)
    try {
      const promises = Object.entries(stagedChanges).map(async ([userId, change]) => {
        const userToVerify = pendingUsers.find(u => u.id === userId)
        if (change.type === 'verify') {
          // Auto-create student record
          if (onAddStudent) {
            await onAddStudent({
              name: userToVerify.name,
              roll: userToVerify.roll,
              domain: userToVerify.domain,
              year: userToVerify.year,
              availability: 'Operational',
              statusNote: 'Automatically verified from registration'
            })
          }

          await updateDoc(doc(db, 'users', userId), {
            status: 'verified',
            role: change.role,
            name: change.role === 'admin' ? `${userToVerify.name} [admin]` : userToVerify.name
          })
        } else if (change.type === 'reject') {
          await deleteDoc(doc(db, 'users', userId))
        }
      })
      await Promise.all(promises)
      setStagedChanges({})
    } catch (error) {
      console.error("Batch update failed:", error)
      alert("Some updates failed. Please try again.")
    } finally {
      setIsCommitting(false)
    }
  }

  const hasChanges = Object.keys(stagedChanges).length > 0

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">User Verification</h1>
          <p className="page-subtitle">Manage system access requests.</p>
        </div>
        {hasChanges && (
          <button 
            className="premium-btn" 
            onClick={handleCommit} 
            disabled={isCommitting}
            style={{ background: '#d4af37', color: 'black' }}
          >
            {isCommitting ? 'COMMITTING...' : `COMMIT ${Object.keys(stagedChanges).length} CHANGES`}
          </button>
        )}
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>DOMAIN</th>
              <th>REQUESTED ON</th>
              <th style={{ textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {pendingUsers.length > 0 ? pendingUsers.map(u => {
              const change = stagedChanges[u.id]
              
              return (
                <tr key={u.id} style={{ opacity: change ? 0.6 : 1, background: change ? 'rgba(212, 175, 55, 0.05)' : 'transparent' }}>
                  <td>
                    <p style={{ fontWeight: 800 }}>{u.name}</p>
                    <p style={{ fontSize: '0.7rem', color: '#666' }}>{u.email}</p>
                    {change && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--maroon)' }}>
                        [STAGED: {change.type.toUpperCase()} {change.role ? `AS ${change.role.toUpperCase()}` : ''}]
                      </span>
                    )}
                  </td>
                  <td><span className="badge">{u.domain}</span></td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {change ? (
                        <button className="premium-btn" onClick={() => clearStage(u.id)} style={{ background: '#666', fontSize: '0.7rem' }}>
                          UNDO
                        </button>
                      ) : (
                        <>
                          <button className="premium-btn" onClick={() => stageVerify(u.id, false)} style={{ background: 'green', fontSize: '0.7rem' }}>
                            <UserCheck size={14} /> MEMBER
                          </button>
                          <button className="premium-btn" onClick={() => stageVerify(u.id, true)} style={{ fontSize: '0.7rem' }}>
                            <ShieldCheck size={14} /> ADMIN
                          </button>
                          <button className="icon-btn delete" onClick={() => stageReject(u.id)}>
                            <UserX size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', fontStyle: 'italic' }}>
                  No pending verification requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NoAccessView() {
  return (
    <div style={{ textAlign: 'center', padding: '5rem' }}>
      <Lock size={64} color="var(--maroon)" style={{ marginBottom: '1.5rem' }} />
      <h2 style={{ fontSize: '1.5rem' }}>RESTRICTED ACCESS</h2>
      <p style={{ color: '#666', fontWeight: 600 }}>You do not have the required clearance level to view this module.</p>
    </div>
  )
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </div>
  )
}

function DashboardHome({ studentsCount, eventsCount, user, events, onUpdateEvent }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isMember = user?.role === 'member'

  // Member-specific stats
  const memberTasks = events.filter(e => 
    e.assignments && Object.values(e.assignments).includes(user?.name)
  )
  const completedTasks = memberTasks.filter(e => e.checklist?.postDone).length
  const currentTasks = memberTasks.filter(e => !e.checklist?.postDone)

  if (isMember) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Welcome back, {user.name.split(' ')[0]}!</h1>
          <p className="page-subtitle">Here is your operational overview for today.</p>
        </div>

        <div className="dashboard-grid">
          <StatCard icon={<Check />} label="Tasks Completed" value={completedTasks.toString()} trend="All time" up />
          <StatCard icon={<Clock />} label="Current Tasks" value={currentTasks.length.toString()} trend="Active" up={currentTasks.length === 0} />
          <StatCard icon={<Calendar />} label="Assigned Events" value={memberTasks.length.toString()} trend="Total" up />
          <StatCard icon={<TrendingUp />} label="Your Efficiency" value={memberTasks.length > 0 ? `${Math.round((completedTasks / memberTasks.length) * 100)}%` : '0%'} trend="Performance" up />
        </div>

        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Rocket size={20} /> Your Active Assignments
          </h2>
          {currentTasks.length > 0 ? (
            <div className="dashboard-grid">
              {currentTasks.map(event => (
                <MemberTaskCard key={event.id} event={event} onUpdateEvent={onUpdateEvent} isAdmin={isAdmin} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '3rem', border: '1px dashed var(--maroon)', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, color: '#666' }}>No active assignments. Enjoy the downtime!</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Management Overview</h1>
        <p className="page-subtitle">Administrative dashboard for club operations.</p>
      </div>

      <div className="dashboard-grid">
        <StatCard icon={<Users />} label="Total Students" value={studentsCount.toLocaleString()} trend="+12%" up />
        <StatCard icon={<Calendar />} label="Active Events" value={eventsCount.toString()} trend="+2" up />
        <StatCard icon={<TrendingUp />} label="System Load" value="LOW" trend="STABLE" up />
        <StatCard icon={<Clock />} label="Database" value="LOCAL" trend="SYNCED" up={true} />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', textTransform: 'uppercase' }}>Recent System Activity</h2>
        <div className="activity-list">
          <ActivityItem title="Persistence engine initialized" user="System" time="Just now" tag="SYSTEM" />
          <ActivityItem title="Student directory loaded" user="System" time="Just now" tag="DATABASE" />
          <ActivityItem title="Event logistics synchronized" user="System" time="Just now" tag="EVENT" />
        </div>
      </div>
    </div>
  )
}

function MemberTaskCard({ event, onUpdateEvent, isAdmin }) {
  const [isManaging, setIsManaging] = useState(false)

  const checklistValues = event.checklist ? Object.values(event.checklist) : []
  const doneTasks = checklistValues.filter(Boolean).length
  const totalTasks = checklistValues.length || 1
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => setIsManaging(true)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <span className="badge">{progress}% COMPLETE</span>
        <span className="badge" style={{ background: 'var(--maroon)', color: 'white' }}>ACTIVE</span>
      </div>
      <h3 style={{ textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {event.name}
        {event.checklist?.postDone && <ShieldCheck size={18} color="#4caf50" />}
      </h3>
      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#666', marginBottom: '1rem' }}>
        LOC: {event.location} | DATE: {event.date}
      </p>
      <div className="progress-container">
        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
      </div>
      
      <button 
        className="premium-btn" 
        style={{ width: '100%', marginTop: '1.5rem', fontSize: '0.75rem' }}
        onClick={(e) => {
          e.stopPropagation()
          setIsManaging(true)
        }}
      >
        MANAGE TASKS
      </button>

      {isManaging && (
        <ManageEventModal 
          event={event}
          onClose={() => setIsManaging(false)}
          onUpdate={(updated) => {
            onUpdateEvent(event.id, updated)
            setIsManaging(false)
          }}
          students={[]} // Not needed for member task management
          events={[]} // Not needed for member task management
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

function StatCard({ icon, label, value, trend, up }) {
  return (
    <div className="stat-card">
      <div style={{ color: 'var(--maroon)', marginBottom: '0.5rem' }}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className={`stat-trend ${up ? 'trend-up' : 'trend-down'}`}>
        {trend}
      </div>
    </div>
  )
}

function ActivityItem({ title, user, time, tag }) {
  return (
    <div className="activity-item">
      <div style={{ width: '8px', height: '8px', background: 'var(--maroon)' }}></div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{title}</p>
        <p style={{ fontSize: '0.75rem', color: '#666' }}>SOURCE: {user} | {time}</p>
      </div>
      <span className="badge">{tag}</span>
    </div>
  )
}

function StudentsView({ students, events, onAddStudent, onEditStudent, onDeleteStudent, readOnly }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Student Directory</h1>
          <p className="page-subtitle">Database of all registered club members.</p>
        </div>
        {/* Manual student entry removed per requirements - now automated via verification */}
        {/* !readOnly && onAddStudent && (
          <button className="premium-btn" onClick={() => {
            setEditingStudent(null)
            setIsModalOpen(true)
          }}>
            + ADD NEW RECORD
          </button>
        ) */}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>ROLL NUMBER</th>
              <th>DOMAIN</th>
              <th>AVAILABILITY</th>
              <th>WORKLOAD</th>
              {!readOnly && <th style={{ textAlign: 'right' }}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {students.length > 0 ? students.map((student) => (
              <tr key={student.id}>
                <td style={{ fontWeight: 700 }}>{student.name}</td>
                <td>{student.roll}</td>
                <td><span className="badge">{student.domain}</span></td>
                <td>
                  <span 
                    className={`badge ${(!student.availability || student.availability === 'Operational') ? 'success' : 'warning'}`} 
                    title={student.statusNote}
                    style={{ cursor: student.statusNote ? 'help' : 'default' }}
                  >
                    {student.availability || 'Operational'}
                  </span>
                </td>
                <td>
                  <WorkloadBadge studentName={student.name} events={events} />
                </td>
                {!readOnly && (
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {onEditStudent && (
                        <button className="icon-btn" onClick={() => {
                          setEditingStudent(student)
                          setIsModalOpen(true)
                        }}>
                          <Edit2 size={16} />
                        </button>
                      )}
                      {onDeleteStudent && (
                        <button className="icon-btn delete" onClick={() => onDeleteStudent(student.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>
                  No records found in database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <StudentModal 
          student={editingStudent}
          onClose={() => setIsModalOpen(false)} 
          onSubmit={(data) => {
            if (editingStudent) {
              onEditStudent({ ...data, id: editingStudent.id })
            } else {
              onAddStudent(data)
            }
            setIsModalOpen(false)
          }} 
        />
      )}
    </div>
  )
}

function StudentModal({ student, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: student?.name || '',
    roll: student?.roll || '',
    domain: student?.domain || 'Photography',
    year: student?.year || '1st Year',
    availability: student?.availability || 'Operational',
    statusNote: student?.statusNote || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button 
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }}
          onClick={onClose}
        >
          [CLOSE]
        </button>
        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>
          {student ? 'Edit Record' : 'Create New Record'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">FULL NAME</label>
            <input 
              type="text" 
              className="input-field" 
              required 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label className="form-label">ROLL NUMBER</label>
            <input 
              type="text" 
              className="input-field" 
              required 
              value={formData.roll}
              onChange={(e) => setFormData({...formData, roll: e.target.value})}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">DOMAIN</label>
              <select 
                className="select-field"
                value={formData.domain}
                onChange={(e) => setFormData({...formData, domain: e.target.value})}
              >
                <option>Photography</option>
                <option>Content Writing</option>
                <option>Social Media</option>
                <option>Video Editing</option>
                <option>Graphic Design</option>
                <option>Management</option>
                <option>PR & Outreach</option>
                <option>Web/App Developer</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">AVAILABILITY STATUS</label>
              <select 
                className="select-field"
                value={formData.availability}
                onChange={(e) => setFormData({...formData, availability: e.target.value})}
              >
                <option>Operational</option>
                <option>On Leave</option>
                <option>Exam Period</option>
                <option>Medical Leave</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">STATUS NOTE</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Optional details..."
                value={formData.statusNote}
                onChange={(e) => setFormData({...formData, statusNote: e.target.value})}
              />
            </div>
          </div>
          
          <button type="submit" className="premium-btn" style={{ width: '100%', marginTop: '1rem' }}>
            {student ? 'UPDATE RECORD' : 'COMMIT RECORD'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EventsView({ events, students, onAddEvent, onUpdateEvent, onDeleteEvent, user }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSuperadmin = user?.role === 'superadmin'

  // Members only see events they are assigned to
  const filteredEvents = isAdmin ? events : events.filter(event => 
    event.assignments && Object.values(event.assignments).includes(user?.name)
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Event Logistics</h1>
          <p className="page-subtitle">Operations and scheduling for club events.</p>
        </div>
        {onAddEvent && (
          <button className="premium-btn" onClick={() => setIsCreateModalOpen(true)}>
            + INITIALIZE EVENT
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        {filteredEvents.length > 0 ? filteredEvents.map((event) => {
          const checklistValues = event.checklist ? Object.values(event.checklist) : []
          const doneTasks = checklistValues.filter(Boolean).length
          const totalTasks = checklistValues.length || 1
          const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

          return (
            <div key={event.id} className="feature-card" onClick={() => setSelectedEvent(event)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <span className="badge">
                  {progress}% COMPLETE
                </span>
                {onDeleteEvent && (
                  <button 
                    className="icon-btn delete" 
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteEvent(event.id)
                    }}
                    style={{ padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <h3 style={{ textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {event.name}
                {event.checklist?.postDone && <ShieldCheck size={18} color="#4caf50" />}
              </h3>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#666', marginBottom: '1rem' }}>
                LOC: {event.location} | DATE: {event.date}
              </p>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )
        }) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', border: '1px dashed var(--maroon)' }}>
            {isAdmin ? 'No active events in the system.' : 'No assignments found for your profile.'}
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <CreateEventModal 
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={(data) => {
            onAddEvent(data)
            setIsCreateModalOpen(false)
          }}
        />
      )}

      {selectedEvent && (
        <ManageEventModal 
          event={selectedEvent}
          students={students}
          events={events}
          onClose={() => setSelectedEvent(null)}
          onUpdate={(updatedEvent) => {
            onUpdateEvent(selectedEvent.id, updatedEvent)
            setSelectedEvent(updatedEvent)
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

function CreateEventModal({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    date: '',
    time: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }} onClick={onClose}>
          [CLOSE]
        </button>
        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Initialize New Event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">EVENT TITLE</label>
            <input type="text" className="input-field" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">LOCATION</label>
            <input type="text" className="input-field" required value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">DATE</label>
              <input type="date" className="input-field" required value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">TIME</label>
              <input type="time" className="input-field" required value={formData.time} onChange={(e) => setFormData({...formData, time: e.target.value})} />
            </div>
          </div>
          <button type="submit" className="premium-btn" style={{ width: '100%', marginTop: '1rem' }}>START OPERATION</button>
        </form>
      </div>
    </div>
  )
}

function ManageEventModal({ event, students, events, onClose, onUpdate, isAdmin }) {
  const [localEvent, setLocalEvent] = useState(event)
  const [isUpdating, setIsUpdating] = useState(false)

  const canUpdate = !!onUpdate
  const readOnly = !canUpdate

  const assignments = localEvent.assignments || {
    photographer: 'Unassigned',
    contentWriter: 'Unassigned',
    pr: 'Unassigned',
    videoEditor: 'Unassigned',
    graphicDesigner: 'Unassigned',
    webDev: 'Unassigned'
  }

  const checklist = localEvent.checklist || {
    membersAssigned: false,
    photosSorted: false,
    photosVerified: false,
    graphicDesignDone: false,
    postVerified: false,
    postDone: false
  }

  const toggleCheck = (key) => {
    if (readOnly) return
    setLocalEvent({
      ...localEvent,
      checklist: {
        ...checklist,
        [key]: !checklist[key]
      }
    })
  }

  const setAssignee = (role, name) => {
    if (readOnly) return
    const updatedEventData = {
      ...localEvent,
      assignments: {
        ...assignments,
        [role]: name
      }
    }
    const allAssigned = Object.values(updatedEventData.assignments).every(val => val !== 'Unassigned')
    updatedEventData.checklist = { ...checklist, membersAssigned: allAssigned }
    setLocalEvent(updatedEventData)
  }

  const handleCommitChanges = async () => {
    setIsUpdating(true)
    try {
      await onUpdate(localEvent)
    } finally {
      setIsUpdating(false)
    }
  }

  const hasChanges = JSON.stringify(localEvent) !== JSON.stringify(event)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <header style={{ borderBottom: '2px solid var(--maroon)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {localEvent.name}
            {checklist.postDone && <ShieldCheck size={24} color="#4caf50" />}
          </h2>
          <p style={{ fontWeight: 600 }}>LOC: {localEvent.location} | DATE: {localEvent.date} | TIME: {localEvent.time}</p>
          <button style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }} onClick={onClose}>
            [CLOSE]
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
          <section>
            <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} /> Personnel Assignment
            </h3>
            <div className="assignment-grid" style={{ gridTemplateColumns: '1fr' }}>
               <AssignmentSelector 
                role="Photographer" 
                domain="Photography"
                value={assignments.photographer} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('photographer', val)} 
                readOnly={readOnly || !isAdmin}
              />
              <AssignmentSelector 
                role="Content Writer" 
                domain="Content Writing"
                value={assignments.contentWriter} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('contentWriter', val)} 
                readOnly={readOnly || !isAdmin}
              />
              <AssignmentSelector 
                role="PR & Outreach" 
                domain="PR & Outreach"
                value={assignments.pr} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('pr', val)} 
                readOnly={readOnly || !isAdmin}
              />
              <AssignmentSelector 
                role="Video Editor" 
                domain="Video Editing"
                value={assignments.videoEditor} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('videoEditor', val)} 
                readOnly={readOnly || !isAdmin}
              />
              <AssignmentSelector 
                role="Graphic Designer" 
                domain="Graphic Design"
                value={assignments.graphicDesigner} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('graphicDesigner', val)} 
                readOnly={readOnly || !isAdmin}
              />
              <AssignmentSelector 
                role="Web Developer" 
                domain="Web/App Developer"
                value={assignments.webDev} 
                students={students} 
                events={events}
                onSelect={(val) => setAssignee('webDev', val)} 
                readOnly={readOnly || !isAdmin}
              />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={18} /> Workflow Tracking
            </h3>
            <div className="checklist">
              <ChecklistItem label="PERSONNEL ASSIGNED" isDone={checklist.membersAssigned} onToggle={() => toggleCheck('membersAssigned')} readOnly={readOnly} />
              <ChecklistItem label="PHOTO SORTING" isDone={checklist.photosSorted} onToggle={() => toggleCheck('photosSorted')} readOnly={readOnly} />
              <ChecklistItem label="PHOTO VERIFICATION" isDone={checklist.photosVerified} onToggle={() => toggleCheck('photosVerified')} readOnly={readOnly} />
              <ChecklistItem label="GRAPHIC PRODUCTION" isDone={checklist.graphicDesignDone} onToggle={() => toggleCheck('graphicDesignDone')} readOnly={readOnly} />
              <ChecklistItem label="POST VERIFICATION" isDone={checklist.postVerified} onToggle={() => toggleCheck('postVerified')} readOnly={readOnly} />
              <ChecklistItem label="FINAL POST COMPLETE" isDone={checklist.postDone} onToggle={() => toggleCheck('postDone')} readOnly={readOnly} />
            </div>
            
            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--maroon)', color: 'white' }}>
              <p style={{ fontWeight: 800, fontSize: '0.75rem', marginBottom: '0.5rem' }}>STATUS REPORT</p>
              <h4 style={{ color: 'white', fontSize: '1.25rem' }}>
                {checklist.postDone ? 'OPERATION COMPLETE' : 'IN PROGRESS'}
              </h4>
            </div>

            {hasChanges && (
              <button 
                className="premium-btn" 
                style={{ width: '100%', marginTop: '1rem', background: '#d4af37', color: 'black' }}
                onClick={handleCommitChanges}
                disabled={isUpdating}
              >
                {isUpdating ? 'SYNCHRONIZING...' : 'COMMIT ALL CHANGES'}
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function AssignmentSelector({ role, domain, value, students, events, onSelect, readOnly }) {
  // Filter students based on the domain required for the role
  const filteredStudents = students.filter(s => s.domain === domain)

  return (
    <div className="assignment-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div className="role-label">{role}</div>
        <div style={{ fontSize: '0.7rem', color: '#666', fontWeight: 600 }}>REQ DOMAIN: {domain}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <select 
          className="select-field" 
          style={{ width: '250px' }}
          value={value}
          onChange={(e) => onSelect(e.target.value)}
          disabled={readOnly}
        >
          <option>Unassigned</option>
          {filteredStudents.map(s => {
            const pendingCount = events.filter(e => 
              !e.checklist.postDone && Object.values(e.assignments).includes(s.name)
            ).length;
            const isAvailable = !s.availability || s.availability === 'Operational';
            
            return (
              <option key={s.id} value={s.name}>
                {s.name} ({pendingCount} Task{pendingCount !== 1 ? 's' : ''}) {!isAvailable ? `[${s.availability}]` : ''}
              </option>
            )
          })}
        </select>
        {value !== 'Unassigned' && (
          <div style={{ color: 'var(--maroon)' }}>
            <WorkloadBadge studentName={value} events={events} showIcon />
          </div>
        )}
      </div>
    </div>
  )
}

function ChecklistItem({ label, isDone, onToggle, readOnly }) {
  return (
    <div 
      className={`checklist-item ${isDone ? 'done' : ''}`} 
      onClick={!readOnly ? onToggle : undefined}
      style={{ cursor: readOnly ? 'default' : 'pointer', opacity: readOnly ? 0.8 : 1 }}
    >
      <div className="checkbox">
        {isDone && <Check size={14} />}
      </div>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</span>
    </div>
  )
}

function WorkloadBadge({ studentName, events, showIcon }) {
  const activeTasks = events.filter(e => 
    !e.checklist.postDone && Object.values(e.assignments).includes(studentName)
  ).length

  let status = 'LOW'
  let color = '#4caf50'
  if (activeTasks >= 3) { status = 'HIGH'; color = '#f44336' }
  else if (activeTasks >= 2) { status = 'MEDIUM'; color = '#ff9800' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 800, color }}>
      {showIcon && <AlertTriangle size={14} />}
      {activeTasks} ACTIVE ({status})
    </div>
  )
}

function ProfileView({ user, onLogout, updateMemberStatus, updateProfileInfo }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    name: user?.name || '',
    domain: user?.domain || '',
    roll: user?.roll || ''
  })

  const handleSave = async () => {
    await updateProfileInfo(editData)
    setIsEditing(false)
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Operational Profile</h1>
          <p className="page-subtitle">Personal record and access credentials.</p>
        </div>
        <button 
          className="premium-btn" 
          onClick={() => setIsEditing(!isEditing)}
          style={{ background: isEditing ? '#666' : 'var(--maroon)' }}
        >
          {isEditing ? '[CANCEL EDIT]' : '[EDIT PROFILE]'}
        </button>
      </div>

      <div className="stat-card" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--maroon)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 800 }}>
            {user?.name?.[0] || 'U'}
          </div>
          <div style={{ flex: 1 }}>
            {isEditing ? (
              <div className="form-group">
                <label className="form-label">FULL NAME</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editData.name}
                  onChange={(e) => setEditData({...editData, name: e.target.value})}
                />
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1.5rem', textTransform: 'uppercase' }}>{user?.name || 'User'}</h2>
                <p style={{ fontWeight: 700, color: 'var(--maroon)' }}>{user?.role?.toUpperCase() || 'MEMBER'}</p>
                <p style={{ color: '#666' }}>{user?.email}</p>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">DOMAIN</label>
              <select 
                className="select-field"
                value={editData.domain}
                onChange={(e) => setEditData({...editData, domain: e.target.value})}
              >
                <option>Photography</option>
                <option>Content Writing</option>
                <option>Social Media</option>
                <option>Video Editing</option>
                <option>Graphic Design</option>
                <option>Management</option>
                <option>PR & Outreach</option>
                <option>Web/App Developer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">ROLL NUMBER</label>
              <input 
                type="text" 
                className="input-field" 
                value={editData.roll}
                onChange={(e) => setEditData({...editData, roll: e.target.value})}
              />
            </div>
            <button 
              className="premium-btn" 
              onClick={handleSave}
              style={{ gridColumn: 'span 2', marginTop: '1rem', background: '#d4af37', color: 'black' }}
            >
              SAVE PROFILE CHANGES
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <ProfileField label="NAME" value={user?.name?.toUpperCase()} />
            <ProfileField label="DOMAIN" value={user?.domain?.toUpperCase()} />
            <ProfileField label="ROLL NUMBER" value={user?.roll || 'NOT SET'} />
            <ProfileField label="CLEARANCE" value={`LEVEL ${user?.role === 'superadmin' ? '4' : user?.role === 'admin' ? '3' : '1'}`} />
          </div>
        )}

        {!isEditing && (
          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--maroon)', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', textTransform: 'uppercase' }}>Update Your Availability</h3>
            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>Inform admins about your current working status.</p>
            <ProfileStatusUpdater user={user} updateMemberStatus={updateMemberStatus} />
          </div>
        )}

        <button 
          className="premium-btn" 
          onClick={onLogout}
          style={{ width: '100%', marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <LogOut size={18} /> TERMINATE SESSION
        </button>
      </div>
    </div>
  )
}

function ProfileStatusUpdater({ user, updateMemberStatus }) {
  const [localAvailability, setLocalAvailability] = useState(user?.availability || 'Operational')
  const [localStatusNote, setLocalStatusNote] = useState(user?.statusNote || '')
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdate = async () => {
    setIsUpdating(true)
    await updateMemberStatus(localAvailability, localStatusNote)
    setIsUpdating(false)
  }

  const hasChanges = localAvailability !== (user?.availability || 'Operational') || 
                     localStatusNote !== (user?.statusNote || '')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div className="form-group">
        <label className="form-label">CURRENT STATUS</label>
        <select 
          className="select-field"
          value={localAvailability}
          onChange={(e) => setLocalAvailability(e.target.value)}
        >
          <option>Operational</option>
          <option>On Leave</option>
          <option>Exam Period</option>
          <option>Medical Leave</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">STATUS NOTE</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. Exams until Friday"
            value={localStatusNote}
            onChange={(e) => setLocalStatusNote(e.target.value)}
          />
          <button 
            className="premium-btn" 
            onClick={handleUpdate}
            disabled={!hasChanges || isUpdating}
            style={{ whiteSpace: 'nowrap', fontSize: '0.7rem', padding: '0 1rem' }}
          >
            {isUpdating ? 'SAVING...' : 'UPDATE STATUS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileField({ label, value }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--maroon)', marginBottom: '0.25rem' }}>{label}</label>
      <div style={{ padding: '0.75rem', border: '1px solid var(--maroon)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function PerformanceSheet({ students, events }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredEvents = events.filter(event => {
    if (!startDate && !endDate) return true;
    const eventDate = new Date(event.date);
    const start = startDate ? new Date(startDate) : new Date('1970-01-01');
    const end = endDate ? new Date(endDate) : new Date('2099-12-31');
    return eventDate >= start && eventDate <= end;
  });

  const memberStats = students.map(student => {
    const studentEvents = filteredEvents.filter(event => 
      Object.values(event.assignments).includes(student.name)
    );
    
    const completedTasks = studentEvents.filter(event => event.checklist.postDone).length;
    const pendingTasks = studentEvents.length - completedTasks;

    return {
      name: student.name,
      roll: student.roll,
      domain: student.domain,
      totalEvents: studentEvents.length,
      completed: completedTasks,
      pending: pendingTasks,
      efficiency: studentEvents.length > 0 
        ? Math.round((completedTasks / studentEvents.length) * 100) 
        : 0
    };
  });

  const exportToCSV = () => {
    const headers = ['Name', 'Roll Number', 'Domain', 'Total Events', 'Completed', 'Pending', 'Efficiency %'];
    const rows = memberStats.map(stat => [
      `"${stat.name}"`,
      `"${stat.roll}"`,
      `"${stat.domain}"`,
      stat.totalEvents,
      stat.completed,
      stat.pending,
      `"${stat.efficiency}%"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Hitian_Performance_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="performance-sheet">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Operational Sheets</h1>
          <p className="page-subtitle">Workforce distribution and performance metrics.</p>
        </div>
        <button className="premium-btn" onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Download size={18} /> EXPORT EXCEL
        </button>
      </div>

      <div className="stat-card" style={{ marginBottom: '2rem', display: 'flex', gap: '2rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="role-label" style={{ marginBottom: '0.5rem', display: 'block' }}>START DATE</label>
          <div style={{ position: 'relative' }}>
            <CalendarDays size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--maroon)' }} />
            <input 
              type="date" 
              className="input-field" 
              style={{ paddingLeft: '2.5rem' }} 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label className="role-label" style={{ marginBottom: '0.5rem', display: 'block' }}>END DATE</label>
          <div style={{ position: 'relative' }}>
            <CalendarDays size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--maroon)' }} />
            <input 
              type="date" 
              className="input-field" 
              style={{ paddingLeft: '2.5rem' }} 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <button className="premium-btn" onClick={() => { setStartDate(''); setEndDate(''); }} style={{ height: '45px' }}>
          CLEAR FILTER
        </button>
      </div>

      <div className="table-container">
        <table className="student-table">
          <thead>
            <tr>
              <th>MEMBER NAME</th>
              <th>DOMAIN</th>
              <th>EVENTS COVERED</th>
              <th>TASKS DONE</th>
              <th>PENDING</th>
              <th>EFFICIENCY</th>
            </tr>
          </thead>
          <tbody>
            {memberStats.map((stat, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 800 }}>{stat.name}</td>
                <td><span className="domain-tag">{stat.domain}</span></td>
                <td style={{ fontWeight: 700 }}>{stat.totalEvents}</td>
                <td style={{ color: 'green', fontWeight: 800 }}>{stat.completed}</td>
                <td style={{ color: stat.pending > 0 ? 'var(--maroon)' : '#666', fontWeight: 800 }}>{stat.pending}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="progress-container" style={{ flex: 1, height: '6px' }}>
                      <div style={{ width: `${stat.efficiency}%`, height: '100%', background: 'var(--maroon)' }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{stat.efficiency}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App
